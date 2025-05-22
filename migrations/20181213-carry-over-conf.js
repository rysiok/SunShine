
'use strict';

const models = require('../lib/model/db');

module.exports = {
  up: (queryInterface, Sequelize) => {

    return queryInterface.describeTable('Companies').then((attributes) => {

      if (attributes.hasOwnProperty('carry_over')) {
        return Promise.resolve();
      }

      return queryInterface.addColumn(
        'Companies',
        'carry_over',
        models.Company.attributes.carry_over
      );
    });
  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.removeColumn('Companies', 'carry_over');
  }
};
