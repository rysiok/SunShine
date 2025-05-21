
/*
 *  Module to encapsulate logic for passport instantiation used for
 *  authentication.
 *
 *  Exports function that return instance of passport object.
 *
 * */

'use strict';

const
  model     = require('../model/db'),
  passport            = require('passport'),
  Promise             = require('bluebird'),
  LocalStrategy       = require('passport-local').Strategy,
  BearerStrategy      = require('passport-http-bearer').Strategy,
  OIDCStrategy        = require('passport-azure-ad').OIDCStrategy,
  config              = require('../config'),
  getCompanyAdminByToken = require('./getCompanyAdminByToken');

// In case if user is successfully logged in, make sure it is
// activated
function prepare_user_for_session(args) {
  var user = args.user,
      done = args.done;

  user.maybe_activate()
    .then(function(user){
      return user.reload_with_session_details();
    })
    .then(function(){
      done(null, user);
    });
}

// Function that performs authentication of given user object
// by given password.
// The method is callback based and the result is conveyed
// via provided callback function "done"
//
function authenticate_user(args){

  var user = args.user,
  password = args.password,
  done     = args.done,
  email    = user.email;

  // In case of LDAP authentification connect the LDAP server
  if ( user.company.ldap_auth_enabled ) {

// email = 'euler@ldap.forumsys.com'; password = 'password'; // TODO remove
    Promise.resolve( user.company.get_ldap_server() )
      .then(function(ldap_server){

      ldap_server.authenticate(email, password, function (err, u) {
        if (err) {
          console.log("LDAP auth error: %s", err);
          return done(null, false);
        }
        prepare_user_for_session({
          user : user,
          done : done,
        });
      });

      ldap_server.close();
    })
    .catch(function(error){
      console.error('Failed while trying to deal with LDAP server with error: %s', error);

      done(null, false);
    });

  // Provided password is correct
  } else if (user.is_my_password(password)) {

    prepare_user_for_session({
      user : user,
      done : done,
    });

  // User exists but provided password does not match
  } else {
      console.error(
        'When login user entered existsing email ' +email+
        ' but incorrect password'
      );
      done(null, false);
  }
}

function strategy_handler(email, password, done) {

  // Normalize email to be in lower case
  email = email.toLowerCase();

  model.User
    .find_by_email( email )
    .then(function(user){

      // Case when no user for provided email
      if ( ! user ) {
        console.error(
          'At login: failed to find user with provided email %s', email
        );

        // We need to abort the execution of current callback function
        // hence the return before calling "done" callback
        return done(null, false);
      }

      // Athenticate user by provided password
      user.getCompany()
        .then(function(company){

          // We need to have company for user fetchef dow the line so query it now
          user.company = company;

          authenticate_user({
            user     : user,
            password : password,
            done     : done,
          });
        });
    })

    // there was unknown error when trying to retrieve user object
    .catch(function(error){
      console.error(
        'At login: unknown error when trying to login in as %s. Error: %s',
        email, error
      );

      done(null, false);
    });
}

module.exports = function(){

  passport.use(new LocalStrategy( strategy_handler ));

  const azureAdConfig = config.get('azure_ad');
  if (azureAdConfig && azureAdConfig.client_id && azureAdConfig.client_secret && azureAdConfig.tenant_id) {
    const oidcStrategy = new OIDCStrategy({
      identityMetadata: `https://login.microsoftonline.com/${azureAdConfig.tenant_id}/v2.0/.well-known/openid-configuration`,
      clientID: azureAdConfig.client_id,
      clientSecret: azureAdConfig.client_secret,
      responseType: 'code id_token',
      responseMode: 'form_post',
      redirectUrl: azureAdConfig.callback_url,
      allowHttpForRedirectUrl: true, // For local development
      validateIssuer: false, // For local development
      useCookieInsteadOfSession: true,
      scope: ['profile', 'offline_access', 'email', 'openid'],
      passReqToCallback: true,
    },
    async (req, iss, sub, profile, accessToken, refreshToken, done) => {
      if (!profile) {
        return done(new Error("No profile was provided"), null);
      }

      let email = profile.upn || profile.email || (profile._json && profile._json.email);

      if (!email) {
        return done(new Error("No email found in profile"), null);
      }
      email = email.toLowerCase();

      try {
        const user = await model.User.find_by_email(email);

        if (!user) {
          console.error(`Azure AD OIDC: No user found for email ${email}`);
          return done(null, false);
        }

        const company = await user.getCompany();
        user.company = company; // Attach company to user object

        if (!company) {
          console.error(`Azure AD OIDC: No company found for user ${email}`);
          return done(null, false);
        }

        if (!company.oauth_auth_enabled) {
          console.error(`Azure AD OIDC: OAuth is not enabled for company ${company.name} (user: ${email})`);
          return done(null, false);
        }
        
        // Check if user account is active before calling prepare_user_for_session
        if (!user.is_active() && !user.is_admin()) {
            console.error(`Azure AD OIDC: User account ${email} is not active.`);
            return done(null, false, {message : 'User account is not active.'});
        }

        prepare_user_for_session({ user, done });

      } catch (error) {
        console.error(`Azure AD OIDC: Error during authentication for email ${email}: ${error}`);
        return done(error, false);
      }
    });

    passport.use('azuread-openidconnect', oidcStrategy);
  } else {
    console.warn("Azure AD OIDC strategy not configured. Missing client_id, client_secret, or tenant_id in app.json.");
  }

  passport.use(new BearerStrategy((token, done) => {
    getCompanyAdminByToken({ token, model })
    .then(user => user.reload_with_session_details())
    .then(user => done(null, user))
    .catch(error => {
      console.log(`Failed to authenticate TOKEN. Reason: '${error}'`);
      done(null, false);
    });
  }));

  // Define how user object is going to be flattered into session
  // after request is processed.
  // In session store we save only user ID
  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  // Defines how the user object is restored based on data saved
  // in session storage.
  // Fetch user data from DB based on ID.
  passport.deserializeUser(function(id, done) {

    model.User.find({where : {id : id}}).then(function(user){
      return user.reload_with_session_details();
    })
    .then(function(user){
      done(null, user);
    })
    .catch(function(error){
      console.error('Failed to fetch session user '+id+' with error: '+error);

      done(null, false, { message : 'Failed to fetch session user' });
    });
  });

  return passport;
};
