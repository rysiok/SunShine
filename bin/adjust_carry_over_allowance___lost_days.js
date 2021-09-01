
'use strict';


var
    crypto        = require('crypto'),
	config        = require('../lib/config'),
	moment        = require('moment');

const
  Promise = require('bluebird'),
  models = require('../lib/model/db');

var currentYear = moment().format('YYYY'),
    startDate = moment({ year : currentYear, month :0, day :1}).format('YYYY-MM-DD'),
    endDate = moment({ year : currentYear, month :2, day :31}).format('YYYY-MM-DD');


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

    /* hashify_password( password_string ) : string
     *
     * For provided string return hashed string.
     *
     * */

/*    var hashify_password = function( password ) {
      return crypto
        .createHash('md5')
        .update(password + config.get('crypto_secret'), (config.get('crypto_hash_encoding') || 'binary'))
        .digest('hex');
    };

    console.log(hashify_password('Qwerasdf')); return;//39ba17e711b2c28461de5977fb54d34e

*/

models.User
  .findAll()
  .then(users => Promise.map(
    users,
    user => {
      return user
        .reload_with_leave_details({})
		 .then(user => user.calculate_number_of_days_taken_from_allowance({startDate:startDate, endDate:endDate}))
		  .then(taken => {
          return user.promise_to_update_allowance_adjustment({
            id    : user.id,
            taken : taken,
			currentYear : currentYear,
          });
        })
        .then(() => Promise.resolve(console.log('Done with user ' + user.name + user.lastname)));
    },
    {concurrency : 1}
  ));
