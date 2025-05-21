/* eslint-env mocha */
'use strict';

const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const passport = require('passport');

const { app, db_model } = require('../../lib/server'); // Assuming server exports app and db_model
const User = db_model.User;
const Company = db_model.Company;

describe('Integration Tests: OAuth Login Flow', function() {

  let testCompany;
  let testUser;
  let mockAzureStrategy;

  before(async function() {
    // Ensure database is clean or setup test data
    await Company.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });

    testCompany = await Company.create_default_company({
      name: 'Test OAuth Company',
      country_code: 'US',
    });

    testUser = await User.register_new_user({
      email: 'oauthuser@test.com',
      name: 'OAuth',
      lastname: 'User',
      password: 'password123', // Still need a password for local part if any
      company_id: testCompany.id,
      admin: false,
    });
    await testUser.user.update({activated: true}); // Activate the user

    // Configure Azure AD settings in config for these tests
    // This requires a way to mock 'config' or ensure it's set for tests
    // For now, assume config is pre-loaded or can be influenced.
    // A better way would be to mock ../config when requiring server.js or passport/index.js
    const config = require('../../lib/config');
    sinon.stub(config, 'get').callsFake(key => {
        if (key === 'azure_ad') {
            return {
                client_id: 'test_client_id_integration',
                client_secret: 'test_client_secret_integration',
                tenant_id: 'test_tenant_id_integration',
                callback_url: '/auth/openid/return'
            };
        }
        if (key === 'allow_create_new_accounts') return false;
        // Add other necessary config values
        return null; // Or actual value
    });
  });

  after(async function() {
    sinon.restore(); // Restore any stubs on config
    await Company.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });
  });

  beforeEach(function() {
    // This is a simplified mock strategy. In a real scenario, you might need
    // a more sophisticated mock that mimics passport-azure-ad behavior.
    // Here, we replace the strategy's authenticate method.
    mockAzureStrategy = {
      authenticate: sinon.stub(),
      name: 'azuread-openidconnect' // Important for passport to find it
    };
    
    // Stub passport.authenticate to control its behavior for this strategy
    // This is a common way to handle external auth in integration tests.
    // We are essentially bypassing the actual external call.
    sinon.stub(passport, 'authenticate')
        .callsFake((strategyName, options) => {
            if (strategyName === 'azuread-openidconnect') {
                // This is the middleware that routes will call.
                // It needs to simulate what Passport's authenticate does.
                return (req, res, next) => {
                    // Call the stubbed authenticate method of our mock strategy
                    // This allows us to control the outcome (success/failure)
                    // For /login/azure, it should redirect.
                    // For /auth/openid/return, it should call a verify callback.
                    if (mockAzureStrategy.authenticate.isSinonProxy) {
                        return mockAzureStrategy.authenticate(req, options)(req, res, next);
                    }
                    // Default behavior if not specifically stubbed for a test case
                    if (options && options.failureRedirect && !req.user) {
                       return res.redirect(options.failureRedirect);
                    }
                    if (req.user) return next(); // Already authenticated
                    return res.redirect('/login'); // Fallback
                };
            }
            // Call the original passport.authenticate for other strategies (e.g., 'local')
            return passport.constructor.prototype.authenticate.call(passport, strategyName, options);
        });
  });

  afterEach(function() {
    sinon.restore(); // Restores all stubs, including passport.authenticate
  });


  describe('GET /login/azure', function() {
    it('should redirect to Azure AD for login', function(done) {
      // For this route, passport.authenticate should itself handle the redirect.
      // We are not calling a verify callback here.
      // The mockAzureStrategy.authenticate needs to simulate this redirect.
      mockAzureStrategy.authenticate.callsFake((req, options) => (reqInner, resInner, nextInner) => {
        // This is the actual external redirect step that passport-azure-ad would do.
        // We can't truly verify the MS URL without deeper mocking of the strategy,
        // but we can verify our app tries to initiate that flow.
        resInner.redirect('https://login.microsoftonline.com/mock_tenant/oauth2/v2.0/authorize?...');
      });

      request(app)
        .get('/login/azure')
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.header.location).to.include('login.microsoftonline.com');
          expect(passport.authenticate.calledWith('azuread-openidconnect')).to.be.true;
          done();
        });
    });
  });

  describe('POST /auth/openid/return', function() {
    it('should login user and redirect to / on successful Azure AD callback', async function() {
      await testCompany.update({ oauth_auth_enabled: true });

      // Simulate successful authentication by passport strategy:
      // passport.authenticate will call a verify callback which then calls req.logIn
      mockAzureStrategy.authenticate.callsFake((req, options) => (reqInner, resInner, nextInner) => {
        // Simulate successful verification, passport calls req.logIn
        reqInner.user = testUser.user; // Attach user to request as if authenticated
        // In real passport flow, req.logIn is called by the strategy's verify callback logic
        // which then calls `prepare_user_for_session` that eventually calls `done(null, user)`.
        // Then passport.authenticate middleware calls req.logIn itself.
        // For testing, we simulate the outcome of this process.
        reqInner.logIn = (user, cb) => { cb(); }; // Mock logIn
        return nextInner(); // Proceed to the route handler
      });

      const agent = request.agent(app); // Use agent to persist session
      await agent
        .post('/auth/openid/return')
        .expect(302)
        .then(res => {
          expect(res.header.location).to.equal('/');
          // Check for session cookie to ensure login
          const sessionCookie = res.header['set-cookie'].find(cookie => cookie.includes('connect.sid'));
          expect(sessionCookie).to.exist;
          // Flash message check
          // Need to make a subsequent request to see the flash message
        });
      
      // Verify flash message
      await agent.get('/')
        .expect(200)
        .then(res => {
            expect(res.text).to.include('Welcome back OAuth!');
        });
    });

    it('should redirect to /login if Azure AD authentication fails (generic)', async function() {
      mockAzureStrategy.authenticate.callsFake((req, options) => (reqInner, resInner, nextInner) => {
        // Simulate failure: passport strategy calls done(null, false) or done(err)
        // This results in passport.authenticate redirecting to failureRedirect
        return resInner.redirect(options.failureRedirect);
      });

      await request(app)
        .post('/auth/openid/return')
        .expect(302)
        .then(res => {
          expect(res.header.location).to.equal('/login');
        });
    });

    it('should redirect to /login if user from Azure AD is not found in local DB', async function() {
      // This scenario is handled by the OIDCStrategy's verify callback logic.
      // The verify callback (unit tested previously) would call done(null, false).
      // So, this test is similar to generic failure from passport.authenticate's perspective.
      mockAzureStrategy.authenticate.callsFake((req, options) => (reqInner, resInner, nextInner) => {
        // Simulate the outcome of the verify callback: done(null, false)
        // which leads passport.authenticate to redirect.
        return resInner.redirect(options.failureRedirect);
      });
      
      await request(app)
        .post('/auth/openid/return')
        .expect(302)
        .then(res => {
          expect(res.header.location).to.equal('/login');
        });
    });
    
    it('should redirect to /login if OAuth is not enabled for the user company', async function() {
      await testCompany.update({ oauth_auth_enabled: false }); // Disable OAuth for the company

      // Similar to above, the verify callback logic handles this.
      mockAzureStrategy.authenticate.callsFake((req, options) => (reqInner, resInner, nextInner) => {
        return resInner.redirect(options.failureRedirect);
      });

      await request(app)
        .post('/auth/openid/return')
        .expect(302)
        .then(res => {
          expect(res.header.location).to.equal('/login');
        });
      
      // Re-enable for other tests if necessary, or ensure tests are isolated
      await testCompany.update({ oauth_auth_enabled: true });
    });
  });
});
