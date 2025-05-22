
'use strict';

var models = require('../lib/model/db'),
  Promise = require('bluebird');

module.exports = {
  up: function (queryInterface, Sequelize) {

    return queryInterface.createTable('user_allowance_adjustment', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false
        // Dynamic defaultValue removed for schema creation
      },
      adjustment: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      carried_over_allowance: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      user_id: { // Foreign key
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: { // As per model options
        allowNull: false,
        type: Sequelize.DATE
      }
    })
    .then(() => queryInterface.addIndex(
      'user_allowance_adjustment',
      ['user_id', 'year'],
      { unique: true, name: 'user_allowance_adjustment_user_id_year_unique_idx' }
    ))
    .then(() => queryInterface.describeTable('Users'))
    .then(function(attributes){

        if ( ! attributes.hasOwnProperty('adjustment')) {
          return Promise.resolve();
        }

        let sql = 'INSERT INTO user_allowance_adjustment (year, adjustment, user_id, created_at) '
          + 'SELECT 2017 AS year, adjustment as adjustment, id as user_id, date() || \' \' || time() as created_at '
          + 'FROM users';

        return queryInterface.sequelize.query( sql );
      })

      .then(() => Promise.resolve());

  },

  down: function (queryInterface, Sequelize) {
    // No way back!
    return Promise.resolve();
  }
};
