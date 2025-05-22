
'use strict';

const
  htmlToText = require('html-to-text'),
  Promise = require('bluebird'),
  models = require('../lib/model/db');

module.exports = {
  up: async () => {
    const records = await models.EmailAudit.findAll();
    return Promise.map(records, rec => {
      return rec.update({ body: htmlToText.fromString(rec.body) });
    }, { concurrency: 1 })
    .then(() => console.log('Done!'));
  },

  // Do nothing
  down: () => Promise.resolve(),
};
