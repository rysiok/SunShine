/* eslint-env mocha */
'use strict';

const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const cheerio = require('cheerio'); // For parsing HTML and checking form values

const { app, db_model } = require('../../lib/server');
const User = db_model.User;
const Company = db_model.Company;
const config = require('../../lib/config');

describe('Integration Tests: OAuth Configuration UI (Settings)', function() {

  let adminUser;
  let testCompany;
  let agent; // For making authenticated requests

  before(async function() {
    // Mock config for Azure AD callback URL generation if necessary
    // (already done in oauth_login.js, ensure it's consistent or use a test helper)
    if (!config.get.isSinonProxy) { // Avoid re-stubbing if already stubbed globally
        sinon.stub(config, 'get').callsFake(key => {
            if (key === 'azure_ad') {
                return {
                    client_id: 'cfg_client_id',
                    client_secret: 'cfg_client_secret',
                    tenant_id: 'cfg_tenant_id',
                    callback_url: '/auth/openid/return' // Ensure this is the base path
                };
            }
            if (key === 'application_domain') return 'http://localhost:3000'; // Example domain
            if (key === 'allow_create_new_accounts') return false;
            return null; 
        });
    }


    await Company.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });

    testCompany = await Company.create_default_company({
      name: 'OAuth Config Test Company',
      country_code: 'US',
    });
    // Set an initial application_domain for the company to test callback URL display
    await testCompany.update({ application_domain: 'https://company.test' });


    const adminData = await User.register_new_admin_user({
      email: 'admin_oauth_settings@test.com',
      name: 'Admin',
      lastname: 'Settings',
      password: 'password123',
      company_name: testCompany.name, // Associate with the created company
      country_code: 'US',
      timezone: 'America/New_York'
    });
    adminUser = adminData; // The result of register_new_admin_user is the user object
    await adminUser.update({ activated: true });


    // Login the admin user and get an agent
    agent = request.agent(app);
    await agent
      .post('/login')
      .send({ username: adminUser.email, password: 'password123' })
      .expect(302); // Redirect on successful login
  });

  after(async function() {
    sinon.restore();
    await Company.destroy({ where: {}, truncate: true, cascade: true });
    await User.destroy({ where: {}, truncate: true, cascade: true });
  });
  
  beforeEach(async function() {
    // Reset company's OAuth settings before each POST test for isolation
    await testCompany.update({
        oauth_auth_enabled: false,
        oauth_auth_config: null
    });
  });

  describe('GET /settings/company/authentication/oauth', function() {
    it('should render the OAuth settings page for an admin', async function() {
      const response = await agent
        .get('/settings/company/authentication/oauth')
        .expect(200);

      const $ = cheerio.load(response.text);
      expect($('h1').text()).to.include('OAuth (Azure AD) Authentication');
      expect($('#oauth_auth_enabled')).to.exist;
      expect($('#oauth_client_id')).to.exist;
      expect($('#oauth_client_secret')).to.exist;
      expect($('#oauth_tenant_id')).to.exist;
      expect($('#oauth_callback_url')).to.exist;
      // Check that the callback URL is correctly formed
      const expectedCallbackUrl = 'https://company.test/auth/openid/return';
      expect($('#oauth_callback_url').val()).to.equal(expectedCallbackUrl);
    });

    it('should display existing OAuth settings if configured', async function() {
      const testConfig = { client_id: '123', client_secret: 'secret', tenant_id: 'abc' };
      await testCompany.update({
        oauth_auth_enabled: true,
        oauth_auth_config: testConfig, // Setter will stringify
      });

      const response = await agent
        .get('/settings/company/authentication/oauth')
        .expect(200);

      const $ = cheerio.load(response.text);
      expect($('#oauth_auth_enabled').is(':checked')).to.be.true;
      expect($('#oauth_client_id').val()).to.equal(testConfig.client_id);
      // Client secret should not be pre-filled for security
      expect($('#oauth_client_secret').val()).to.be.empty; 
      expect($('#oauth_tenant_id').val()).to.equal(testConfig.tenant_id);
    });
    
    it('should redirect to login if user is not authenticated', async function() {
        await request(app) // New unauthenticated agent
            .get('/settings/company/authentication/oauth')
            .expect(302)
            .then(res => {
                expect(res.header.location).to.equal('/login');
            });
    });
    
    // Add test for non-admin user if such roles exist and are differentiated
  });

  describe('POST /settings/company/authentication/oauth', function() {
    const validOAuthConfig = {
      oauth_client_id: 'test-client-id',
      oauth_client_secret: 'test-client-secret',
      oauth_tenant_id: 'test-tenant-id',
    };

    it('should enable and save OAuth settings successfully', async function() {
      await agent
        .post('/settings/company/authentication/oauth')
        .send({
          oauth_auth_enabled: 'on', // Checkbox value
          ...validOAuthConfig,
        })
        .expect(302)
        .then(async res => {
          expect(res.header.location).to.equal('/settings/company/authentication/oauth');
          // Check flash message (requires another request with the agent)
          const getRes = await agent.get('/settings/company/authentication/oauth');
          expect(getRes.text).to.include('OAuth configuration was successfully updated.');
        });

      await testCompany.reload();
      expect(testCompany.oauth_auth_enabled).to.be.true;
      expect(testCompany.oauth_auth_config.client_id).to.equal(validOAuthConfig.oauth_client_id);
      expect(testCompany.oauth_auth_config.client_secret).to.equal(validOAuthConfig.oauth_client_secret);
      expect(testCompany.oauth_auth_config.tenant_id).to.equal(validOAuthConfig.oauth_tenant_id);
    });

    it('should disable OAuth settings successfully', async function() {
      // First, enable it
      await testCompany.update({ oauth_auth_enabled: true, oauth_auth_config: validOAuthConfig });

      await agent
        .post('/settings/company/authentication/oauth')
        .send({
          // oauth_auth_enabled is not sent when checkbox is off
          oauth_client_id: validOAuthConfig.oauth_client_id, // Send previous values
          oauth_tenant_id: validOAuthConfig.oauth_tenant_id,
        })
        .expect(302)
        .then(async res => {
          expect(res.header.location).to.equal('/settings/company/authentication/oauth');
          const getRes = await agent.get('/settings/company/authentication/oauth');
          expect(getRes.text).to.include('OAuth configuration was successfully updated.');
        });

      await testCompany.reload();
      expect(testCompany.oauth_auth_enabled).to.be.false;
    });
    
    it('should update existing OAuth settings (client secret provided)', async function() {
        await testCompany.update({
            oauth_auth_enabled: true,
            oauth_auth_config: { client_id: 'old-id', client_secret: 'old-secret', tenant_id: 'old-tenant' }
        });
        
        const newConfig = {
            oauth_client_id: 'new-client-id',
            oauth_client_secret: 'new-client-secret',
            oauth_tenant_id: 'new-tenant-id',
        };

        await agent
            .post('/settings/company/authentication/oauth')
            .send({ oauth_auth_enabled: 'on', ...newConfig })
            .expect(302);

        await testCompany.reload();
        expect(testCompany.oauth_auth_enabled).to.be.true;
        expect(testCompany.oauth_auth_config.client_id).to.equal(newConfig.oauth_client_id);
        expect(testCompany.oauth_auth_config.client_secret).to.equal(newConfig.oauth_client_secret);
        expect(testCompany.oauth_auth_config.tenant_id).to.equal(newConfig.oauth_tenant_id);
    });
    
    it('should update existing OAuth settings (client secret NOT provided, should keep old)', async function() {
        const initialSecret = 'keep-this-secret';
        await testCompany.update({
            oauth_auth_enabled: true,
            oauth_auth_config: { client_id: 'id-1', client_secret: initialSecret, tenant_id: 'tenant-1' }
        });
        
        const updatedConfig = {
            oauth_client_id: 'id-2',
            oauth_client_secret: '', // Empty secret
            oauth_tenant_id: 'tenant-2',
        };

        await agent
            .post('/settings/company/authentication/oauth')
            .send({ oauth_auth_enabled: 'on', ...updatedConfig })
            .expect(302);

        await testCompany.reload();
        expect(testCompany.oauth_auth_enabled).to.be.true;
        expect(testCompany.oauth_auth_config.client_id).to.equal(updatedConfig.oauth_client_id);
        expect(testCompany.oauth_auth_config.client_secret).to.equal(initialSecret); // Important check
        expect(testCompany.oauth_auth_config.tenant_id).to.equal(updatedConfig.oauth_tenant_id);
    });


    it('should show error if enabling OAuth without Client ID', async function() {
      const response = await agent
        .post('/settings/company/authentication/oauth')
        .send({
          oauth_auth_enabled: 'on',
          // oauth_client_id is missing
          oauth_client_secret: 'secret',
          oauth_tenant_id: 'tenant',
        })
        .expect(302); // Redirects back to the form with error
      
      const getResponse = await agent.get(response.header.location); // Follow redirect
      expect(getResponse.text).to.include('Client ID cannot be empty when OAuth is enabled.');

      await testCompany.reload();
      expect(testCompany.oauth_auth_enabled).to.be.false; // Should not have been enabled
    });

    it('should show error if enabling OAuth without Tenant ID', async function() {
       const response = await agent
        .post('/settings/company/authentication/oauth')
        .send({
          oauth_auth_enabled: 'on',
          oauth_client_id: 'clientid',
          oauth_client_secret: 'secret',
          // oauth_tenant_id is missing
        })
        .expect(302);
        
      const getResponse = await agent.get(response.header.location);
      expect(getResponse.text).to.include('Tenant ID cannot be empty when OAuth is enabled.');

      await testCompany.reload();
      expect(testCompany.oauth_auth_enabled).to.be.false;
    });
    
    it('should redirect to login if user is not authenticated', async function() {
        await request(app) // New unauthenticated agent
            .post('/settings/company/authentication/oauth')
            .send({ oauth_auth_enabled: 'on', ...validOAuthConfig})
            .expect(302)
            .then(res => {
                expect(res.header.location).to.equal('/login');
            });
    });
  });
});
