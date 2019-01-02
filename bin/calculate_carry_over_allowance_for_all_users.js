
'use strict';

const
  Promise = require('bluebird'),
  moment = require('moment'),
  models = require('../lib/model/db');

const
  YEAR_FROM = '2018',
  YEAR_TO   = '2019';

/*
 *  1. Get all users
 *
 *  2. Iterate through users and:
 *
 *  3. Calculate remaining days for current year
 *
 *  4. Put value from step 3 into user_allowance_adjustment.carried_over_allowance
 *     of next year
 *
 * */

models.User
  .findAll()
  .then(users => Promise.map(
    users,
    user => {
      let carryOver;
      return Promise.resolve(user.getCompany().then(c => carryOver = c.carry_over))
        .then(() => user.reload_with_leave_details({YEAR_FROM}))
        .then(user => user.promise_allowance({year:moment.utc(YEAR_FROM, 'YYYY')}))
        .then(allowance => {
          return user.promise_to_update_carried_over_allowance({
            year                   : YEAR_TO,
            carried_over_allowance : Math.min(allowance.number_of_days_available_in_allowance, carryOver),
          });
        })
        .then(() => Promise.resolve(console.log('Done with user ' + user.id)));
    },
    {concurrency : 1}
  ));
