'use strict';

var models = require('../lib/model/db');

module.exports = {
  up: function (queryInterface, Sequelize) {

    return queryInterface.describeTable('LeaveTypes').then(function(attributes){

      if (attributes.hasOwnProperty('auto_approve')) {
        return Promise.resolve();
      }

      return queryInterface.addColumn(
        'LeaveTypes',
        'auto_approve',
        models.LeaveType.attributes.auto_approve
      );
    });

  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.removeColumn('LeaveTypes', 'auto_approve');
  }
};
