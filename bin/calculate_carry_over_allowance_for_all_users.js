
'use strict';

const
  Promise = require('bluebird'),
  models = require('../lib/model/db');

var
  YEAR_FROM = moment().format('YYYY'),
  YEAR_TO   = moment().add(1, 'year').format('YYYY');

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
      return user
        .reload_with_leave_details({YEAR_FROM})
        .then( user => user.promise_number_of_days_available_in_allowance(YEAR_FROM) )
        .then(remainer => {
          return user.promise_to_update_carried_over_allowance({
            year                   : YEAR_TO,
            carried_over_allowance : remainer,
          });
        })
        .then(() => Promise.resolve(console.log('Done with user ' + user.id)));
    },
    {concurrency : 1}
  ));
