
'use strict';


var
    crypto        = require('crypto'),
	config        = require('../lib/config'),
	moment        = require('moment');

const
  Promise = require('bluebird'),
  models = require('../lib/model/db');

const
  YEAR_FROM = '2018';

var currentYear = moment().format('YYYY');


/*  run script at certain date, it will adjust reamining days according to carried over allowance
 *  and dont allow to use them after certain date
 *
 *  1. Get all users
 *
 *  2. Iterate through users and:
 *
 *  3. Calculate number_of_days_taken_from_allowance for current year
 *
 *  4. if carried_over_allowance - taken from step 3 is greater than 0, decrease allowance with taken
 *
 * */



models.User
  .findAll()
  .then(users => Promise.map(
    users,
    user => {
      return user
        .reload_with_leave_details({})
		 .then(user => user.calculate_number_of_days_taken_from_allowance({}))
		  .then(taken => {
          return user.promise_to_update_allowance_adjustment({
            id    : user.id,
            taken : taken,
			currentYear : currentYear,
          });
        })
        .then(() => Promise.resolve(console.log('Done with user ' + user.id)));
    },
    {concurrency : 1}
  ));
