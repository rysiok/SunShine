'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Companies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      country: {
        type: Sequelize.STRING,
        allowNull: false
      },
      start_of_new_year: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      share_all_absences: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_team_view_hidden: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      ldap_auth_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      ldap_auth_config: {
        type: Sequelize.STRING, // Stored as JSON string
        allowNull: true,
      },
      date_format: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'YYYY-MM-DD',
      },
      company_wide_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      mode: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      timezone: {
        type: Sequelize.TEXT, 
        allowNull: false, 
        defaultValue: 'Europe/London',
      },
      integration_api_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      integration_api_token: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      carry_over: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('LeaveTypes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      color: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '#ffffff'
      },
      use_allowance: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      limit: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      auto_approve: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('Departments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      allowance: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 20,
      },
      include_public_holidays: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_accrued_allowance: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Companies', // name of Target model
          key: 'id', // key in Target model that we're referencing
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      bossId: { // Foreign key for User (Boss)
        type: Sequelize.INTEGER,
        allowNull: true,
        // references: { model: 'Users', key: 'id' }, // Deferring to avoid order issues
        // onUpdate: 'CASCADE',
        // onDelete: 'SET NULL', // Or CASCADE, depending on desired behavior
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true // Assuming email should be unique
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      lastname: {
        type: Sequelize.STRING,
        allowNull: false
      },
      activated: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      admin: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      auto_approve: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      DepartmentId: { // Note: model uses DepartmentId, not departmentId
        type: Sequelize.INTEGER,
        allowNull: true, // Can be true if user is not initially assigned to a department
        references: { model: 'Departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL' // Or CASCADE/RESTRICT based on requirements
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('EmailAudit', { // freezeTableName: true
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      subject: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      company_id: { // underscored: true
        type: Sequelize.INTEGER,
        allowNull: true, // Or false, depending on if it's mandatory
        references: { model: 'Companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL' // Or CASCADE
      },
      user_id: { // underscored: true
        type: Sequelize.INTEGER,
        allowNull: true, // Or false
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL' // Or CASCADE
      },
      created_at: { // underscored: true, createdAt: 'created_at'
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('EmailAudit');
    await queryInterface.dropTable('Users');
    await queryInterface.dropTable('LeaveTypes');
    await queryInterface.dropTable('Departments');
    await queryInterface.dropTable('Companies');
  }
};
