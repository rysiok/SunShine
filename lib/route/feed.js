
"use strict";

const
  express  = require('express'),
  sqlite3 = require('sqlite3'), crypto = require('crypto'),
  router   = express.Router(),
  _        = require('underscore'),
  moment   = require('moment'),
  Promise  = require('bluebird'),
  ical     = require('ical-generator'),
  config   = require('../config'),
  TeamView = require('../model/team_view');

const
  numberOfFutureMonthsInTeamViewFeed = config.get('number_of_future_months_in_team_view_feed') || 6,
  numberOfPastMonthsInTeamViewFeed   = config.get('number_of_past_months_in_team_view_feed') || 2;

const { getCommentsForLeave } = require('../model/comment');

const db = new sqlite3.Database('./db.development.sqlite'),
secret = "Appendage.Pouch.Flatly.Carol2",/*process.env.EXPORTPWD || crypto.randomBytes(64).toString('base64'),*/
key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);

router.get('/export', function(req, res){
const query = `select strftime('%Y-%m-%d', Leaves.date_start) as 'date_start', strftime('%Y-%m-%d', Leaves.date_end) as 'date_end', 
Leaves.day_part_start, Leaves.day_part_end, 
Leaves.leaveTypeId, LeaveTypes.name as 'leave_name',
Users.email, Users.name, Users.lastname 
from Leaves join Users on Leaves.userId=Users.id join LeaveTypes on LeaveTypes.id = Leaves.leaveTypeId
where (strftime('%Y', Leaves.date_end)=strftime('%Y', date('now'))
or strftime('%Y', Leaves.date_end)=strftime('%Y', date('now', '-1 years')))
and Leaves.status in (1,2)
order by Leaves.date_end`;
    const iv = crypto.randomBytes(16);

    db.all(query, (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).send(err);
            return;
        }
        const jsonData = JSON.stringify(rows);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(jsonData, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        res.json({
            data: encrypted,
            iv: iv.toString('base64')
        });
    });
});

router.get('/:token/ical.ics', function(req, res){

  var cal = ical({
      domain : 'timeoff.management',
    }),
    token = req.params['token'],
    model = req.app.get('db_model'),
    user;

  Promise
    .resolve()
    .then(() => model.UserFeed.find({
        where   : {feed_token : token},
        include : [{
          model : model.User,
          as    : 'user',
          include : [{
            model : model.Company,
            as    : 'company',
            where : {
              mode : {$ne : model.Company.get_mode_readonly_holidays()},
            },
          }]
        }]
      })
    )
    .then(function(feed){

      if ( ! feed ) {
        throw new Error("Unknown token provided");
      }

      user = feed.user;

      if (feed.is_calendar()){
        cal.name(user.full_name() + ' calendar');

        return user
          .promise_calendar({
            year           : user.company.get_today(),
            show_full_year : true,
          })
          .then(function(calendar){
            let days = _.flatten( calendar.map( cal => cal.as_for_team_view() ));

            days.forEach(day => day.user = user);

            return Promise.resolve(days);
          });
      } else {

        cal.name(`${ user.full_name() }'s team whereabout`);

        // Get the list of month deltas in relation to current month, to we can calculate
        // moths for which to build the feed
        let monthDeltas = Array.from(Array(numberOfFutureMonthsInTeamViewFeed + 1).keys())
          .concat( Array.from(Array(numberOfPastMonthsInTeamViewFeed).keys()).map(i => -1 * (i + 1)) );

        return Promise
          .resolve(
            monthDeltas.map(
              delta => user.company.get_today().clone().add(delta, 'months').startOf('month')
            )
          )
          .map(month => {

            const team_view = new TeamView({
              user      : user,
              base_date : month,
            });

            return team_view.promise_team_view_details()
              .then(details => {
                let days = [];

                details.users_and_leaves.forEach(rec => {
                  rec.days.forEach(day => day.user = rec.user);
                  days = days.concat( rec.days );
                });

                return Promise.resolve(days);
              });
          }, { concurrency : 2 })
          .then(arrayOfDays => Promise.resolve( _.flatten(arrayOfDays) ));
      }
    })

    .then(async (days) => {
      for (const day of days) {
        // We care only about days when employee is on leave
        if (!(day.is_leave_morning || day.is_leave_afternoon)) {
          continue;
        }

        let start = moment.utc(day.moment),
            end = moment.utc(day.moment),
            allDay = false;

        if (day.is_leave_morning && day.is_leave_afternoon) {
          start.hour(9).minute(0);
          end.hour(17).minute(0);
          allDay = true;
        } else if (!day.is_leave_morning && day.is_leave_afternoon) {
          start.hour(13).minute(0);
          end.hour(17).minute(0);
        } else if (day.is_leave_morning && !day.is_leave_afternoon) {
          start.hour(9).minute(0);
          end.hour(13).minute(0);
        }

        const comments = await getCommentsForLeave({leave: day.leave_obj});

        cal.createEvent({
          start   : start.toDate(),
          end     : end.toDate(),
          allDay  : allDay,
          summary : day.user.full_name() + ' is OOO (out of office)',
          description: (comments.length > 0
            ? `With comments: ${comments.map(({comment}) => comment).join('. ')}`
            : ''
          ),
        });
      }

      res.send( cal.toString() );
    })
    .catch(error => {

      console.log(`Failed to fetch feed because of: ${error}`);

      // TODO VPP set 404 status
      res.send('N/A');
    });

});


module.exports = router;
