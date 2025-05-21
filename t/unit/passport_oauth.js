/* eslint-env mocha */
'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Passport OAuth Strategy (lib/passport/index.js)', function() {

  let mockPassport;
  let mockConfig;
  let MockOIDCStrategy;
  let mockModelUser;
  let mockModelCompany;
  let passportIndex; // Module under test

  let strategyInstance; // To capture the OIDCStrategy instance
  let strategyCallback; // To capture the callback passed to OIDCStrategy

  // Mock for prepare_user_for_session
  let mockPrepareUserForSession;

  beforeEach(function() {
    mockPassport = {
      use: sinon.spy(),
      serializeUser: sinon.spy(),
      deserializeUser: sinon.spy(),
    };

    mockConfig = {
      get: sinon.stub(),
    };

    // Mock OIDCStrategy constructor to capture its instance and callback
    MockOIDCStrategy = sinon.spy(function(options, callback) {
      strategyInstance = this; // `this` would be the new strategy instance
      strategyCallback = callback; // Capture the verify callback
      // Simulate a strategy object that passport.use would expect
      this.name = 'azuread-openidconnect'; 
    });
    
    mockModelUser = {
      find_by_email: sinon.stub(),
      is_active: sinon.stub().returns(true), // Default to active
      is_admin: sinon.stub().returns(false), // Default to not admin
      getCompany: sinon.stub(),
    };

    mockModelCompany = {
      // No methods needed directly for company instance in these unit tests yet,
      // but oauth_auth_enabled will be a property.
    };
    
    // Mock the global prepare_user_for_session function
    // This is tricky because it's not directly passed but invoked.
    // We'll have to rely on asserting it's called via the callback chain.
    // For direct testing of prepare_user_for_session, it would need its own unit tests.
    // Here, we're testing the OIDCStrategy handler's interaction with it.
    mockPrepareUserForSession = sinon.spy();


    // Use proxyquire to load the passport module with mocks
    // We need to ensure that the `prepare_user_for_session` used by the strategy callback is our mock.
    // This is difficult if it's a local function.
    // The current implementation of `lib/passport/index.js` has `prepare_user_for_session` as a local function.
    // To make it testable, it should ideally be passed as a dependency or be part of an object.
    // For now, we'll assume we can test its invocation through the `done` callback logic.
    // If `prepare_user_for_session` was structured like: `const { prepare_user_for_session } = require('./utils');`
    // then we could mock './utils'.
    // Given the current structure, we will focus on the `done` calls.
    // If `prepare_user_for_session` makes a `done` call, we can test that.

    passportIndex = proxyquire('../../lib/passport', {
      'passport': mockPassport,
      '../config': mockConfig,
      'passport-azure-ad': { OIDCStrategy: MockOIDCStrategy },
      './db': { User: mockModelUser, Company: mockModelCompany }, // Assuming models are accessed via '../model/db'
      // Attempt to mock prepare_user_for_session if it were external, e.g.
      // './prepareUserForSession': mockPrepareUserForSession 
    });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('OIDCStrategy Registration and Handler', function() {
    it('should register OIDCStrategy if Azure AD config is present', function() {
      mockConfig.get.withArgs('azure_ad').returns({
        client_id: 'test_client_id',
        client_secret: 'test_client_secret',
        tenant_id: 'test_tenant_id',
        callback_url: '/auth/openid/return'
      });

      passportIndex(); // Initialize passport strategies

      expect(mockPassport.use.calledOnce).to.be.true;
      expect(MockOIDCStrategy.calledOnce).to.be.true;
      const strategyArgs = MockOIDCStrategy.args[0][0];
      expect(strategyArgs.clientID).to.equal('test_client_id');
      expect(strategyArgs.clientSecret).to.equal('test_client_secret');
      expect(strategyArgs.identityMetadata).to.include('test_tenant_id');
      expect(strategyArgs.redirectUrl).to.equal('/auth/openid/return');
      expect(strategyArgs.passReqToCallback).to.be.true;
      expect(typeof strategyCallback).to.equal('function');
    });

    it('should NOT register OIDCStrategy if Azure AD config is missing client_id', function() {
      mockConfig.get.withArgs('azure_ad').returns({
        // client_id is missing
        client_secret: 'test_client_secret',
        tenant_id: 'test_tenant_id',
      });
      const consoleWarnSpy = sinon.spy(console, 'warn');

      passportIndex();

      expect(mockPassport.use.calledWith(sinon.match.has('name', 'azuread-openidconnect'))).to.be.false;
      expect(MockOIDCStrategy.called).to.be.false;
      expect(consoleWarnSpy.calledWith(sinon.match(/Azure AD OIDC strategy not configured/))).to.be.true;
    });
    
    it('should NOT register OIDCStrategy if Azure AD config is missing entirely', function() {
      mockConfig.get.withArgs('azure_ad').returns(null);
      const consoleWarnSpy = sinon.spy(console, 'warn');

      passportIndex();
      
      expect(mockPassport.use.calledWith(sinon.match.has('name', 'azuread-openidconnect'))).to.be.false;
      expect(MockOIDCStrategy.called).to.be.false;
      expect(consoleWarnSpy.calledWith(sinon.match(/Azure AD OIDC strategy not configured/))).to.be.true;
    });

    describe('OIDCStrategy Callback', function() {
      let mockReq;
      let mockProfile;
      let mockDone;
      let mockUserInstance;
      let mockCompanyInstance;

      beforeEach(function() {
        // Ensure the strategy is registered and callback is captured
        mockConfig.get.withArgs('azure_ad').returns({
          client_id: 'cid', client_secret: 'csec', tenant_id: 'tid', callback_url: '/cb'
        });
        passportIndex(); // This will call new MockOIDCStrategy and set strategyCallback

        mockReq = {}; // Mock request object, passReqToCallback is true
        mockProfile = {
          upn: 'user@example.com',
          _json: { email: 'user_json@example.com' } // Provide a fallback
        };
        mockDone = sinon.spy();

        mockUserInstance = {
          email: 'user@example.com',
          is_active: sinon.stub().returns(true),
          is_admin: sinon.stub().returns(false),
          getCompany: sinon.stub(),
          // Mock the prepare_user_for_session behavior indirectly
          // by checking what it does with `done`
        };
        
        mockCompanyInstance = {
          name: 'Test Company',
          oauth_auth_enabled: true,
        };

        mockModelUser.find_by_email.resolves(mockUserInstance);
        mockUserInstance.getCompany.resolves(mockCompanyInstance);
        
        // This is a stand-in for the actual prepare_user_for_session.
        // The real function calls done(null, user).
        // We are testing if the strategy callback correctly invokes `done`
        // after its internal logic, which includes calling prepare_user_for_session.
        global.prepare_user_for_session = sinon.stub().callsFake(args => {
            args.done(null, args.user); 
        });
      });
      
      afterEach(function() {
        delete global.prepare_user_for_session; // Clean up global mock
      });

      it('should call prepare_user_for_session (and then done(null, user)) on successful authentication', async function() {
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockModelUser.find_by_email.calledOnceWith('user@example.com')).to.be.true;
        expect(mockUserInstance.getCompany.calledOnce).to.be.true;
        expect(global.prepare_user_for_session.calledOnce).to.be.true;
        const prepArgs = global.prepare_user_for_session.args[0][0];
        expect(prepArgs.user.email).to.equal(mockUserInstance.email);
        // expect(prepArgs.done).to.equal(mockDone); // prepare_user_for_session gets `done`
        
        expect(mockDone.calledOnceWith(null, mockUserInstance)).to.be.true;
      });

      it('should use profile.email if upn is not available', async function() {
        delete mockProfile.upn; // Remove upn
        mockProfile.email = 'profile_email@example.com'; // Add direct email
        mockModelUser.find_by_email.withArgs('profile_email@example.com').resolves(mockUserInstance);

        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);

        expect(mockModelUser.find_by_email.calledOnceWith('profile_email@example.com')).to.be.true;
        expect(mockDone.calledOnceWith(null, mockUserInstance)).to.be.true;
      });
      
      it('should use profile._json.email if upn and profile.email are not available', async function() {
        delete mockProfile.upn;
        delete mockProfile.email;
        // _json.email is already 'user_json@example.com' in mockProfile
        mockModelUser.find_by_email.withArgs('user_json@example.com').resolves(mockUserInstance);

        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);

        expect(mockModelUser.find_by_email.calledOnceWith('user_json@example.com')).to.be.true;
        expect(mockDone.calledOnceWith(null, mockUserInstance)).to.be.true;
      });


      it('should call done(Error) if no profile is provided', async function() {
        await strategyCallback(mockReq, 'iss', 'sub', null, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnce).to.be.true;
        expect(mockDone.args[0][0]).to.be.an('error');
        expect(mockDone.args[0][0].message).to.equal('No profile was provided');
        expect(mockDone.args[0][1]).to.be.null;
      });

      it('should call done(Error) if no email is found in profile', async function() {
        mockProfile.upn = null;
        mockProfile.email = null;
        mockProfile._json = null; // or mockProfile._json.email = null
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnce).to.be.true;
        expect(mockDone.args[0][0]).to.be.an('error');
        expect(mockDone.args[0][0].message).to.equal('No email found in profile');
        expect(mockDone.args[0][1]).to.be.null;
      });

      it('should call done(null, false) if user is not found', async function() {
        mockModelUser.find_by_email.resolves(null);
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnceWith(null, false)).to.be.true;
      });
      
      it('should call done(null, false) if user has no company', async function() {
        mockUserInstance.getCompany.resolves(null); // User has no company
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnceWith(null, false)).to.be.true;
      });

      it('should call done(null, false) if company has OAuth disabled', async function() {
        mockCompanyInstance.oauth_auth_enabled = false;
        mockUserInstance.getCompany.resolves(mockCompanyInstance);
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnceWith(null, false)).to.be.true;
      });

      it('should call done(null, false, {message}) if user is not active and not admin', async function() {
        mockUserInstance.is_active.returns(false);
        mockUserInstance.is_admin.returns(false);
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnceWith(null, false, { message: 'User account is not active.' })).to.be.true;
      });
      
      it('should succeed if user is not active BUT is admin', async function() {
        mockUserInstance.is_active.returns(false);
        mockUserInstance.is_admin.returns(true); // Admin user
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(global.prepare_user_for_session.calledOnce).to.be.true;
        expect(mockDone.calledOnceWith(null, mockUserInstance)).to.be.true;
      });

      it('should call done(error, false) if find_by_email rejects', async function() {
        const dbError = new Error('Database error');
        mockModelUser.find_by_email.rejects(dbError);
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnceWith(dbError, false)).to.be.true;
      });
      
      it('should call done(error, false) if getCompany rejects', async function() {
        const companyError = new Error('Company fetch error');
        mockUserInstance.getCompany.rejects(companyError);
        
        await strategyCallback(mockReq, 'iss', 'sub', mockProfile, 'access_token', 'refresh_token', mockDone);
        
        expect(mockDone.calledOnceWith(companyError, false)).to.be.true;
      });
    });
  });
});
