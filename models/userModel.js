const db = require('../config/database');

class User {
  // Unified logging method
  static async logOperation(operation, success = true, error = null) {
    const timestamp = new Date().toISOString();
    if (success) {
      console.log(`[${timestamp}] ${operation} completed successfully`);
    } else {
      console.error(`[${timestamp}] ${operation} failed:`, error);
    }
  }

  // Validate email format
  static isValidEmail(email) {
    if (!email) return true; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate required fields
  static validateRequiredFields(data, requiredFields) {
    const missingFields = requiredFields.filter(field => !data[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  // Execute query with timeout and error handling
  static async executeQuery(query, values = [], operationName = 'Query') {
    const client = await db.connect();

    try {
      // Set query timeout (5 seconds default)
      await client.query('SET statement_timeout TO 5000');

      const result = await client.query(query, values);
      await this.logOperation(operationName, true);
      return result;
    } catch (error) {
      await this.logOperation(operationName, false, error);

      // Handle specific error codes
      if (error.code === '23505') { // Unique violation
        throw new Error('Duplicate entry: Record already exists');
      } else if (error.code === '23503') { // Foreign key violation
        throw new Error('Referenced record does not exist');
      } else if (error.code === '23502') { // Not null violation
        throw new Error('Required field is missing');
      }

      throw error;
    } finally {
      client.release();
    }
  }

  // Create users table if not exists
  static async createTable(client = null) {
    const query = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        sub VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        date_of_birth DATE,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_sub ON users(sub);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    `;

    if (client) {
      await client.query(query);
    } else {
      await this.executeQuery(query, [], 'Create users table');
    }
  }

  // Create licence categories table
  static async createLicenceCategoriesTable(client = null) {
    const query = `
      CREATE TABLE IF NOT EXISTS licence_categories (
        id SERIAL PRIMARY KEY,
        category_code VARCHAR(10) UNIQUE NOT NULL,
        category_label VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        fee DECIMAL(10,2) NOT NULL,
        min_age INTEGER DEFAULT 18,
        vehicle_type VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_categories_code ON licence_categories(category_code);
      CREATE INDEX IF NOT EXISTS idx_categories_active ON licence_categories(is_active);
      CREATE INDEX IF NOT EXISTS idx_categories_vehicle_type ON licence_categories(vehicle_type);
    `;

    if (client) {
      await client.query(query);
    } else {
      await this.executeQuery(query, [], 'Create licence categories table');
    }
  }

  // Create user sessions table
  // Create user sessions table with trigger - RECOMMENDED
  static async createSessionsTable(client = null) {
    const query = `
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,  
      sub VARCHAR(100) REFERENCES users(sub) ON DELETE CASCADE,
      session_id VARCHAR(255) UNIQUE NOT NULL,
      access_token TEXT,
      token_type VARCHAR(50),
      expires_in INTEGER DEFAULT 3600,
      scope TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );
    
    -- Create function to calculate expires_at
    CREATE OR REPLACE FUNCTION calculate_expires_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.expires_at = NEW.created_at + (NEW.expires_in || ' seconds')::INTERVAL;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create trigger to automatically set expires_at
    DROP TRIGGER IF EXISTS set_expires_at ON user_sessions;
    CREATE TRIGGER set_expires_at
      BEFORE INSERT OR UPDATE ON user_sessions
      FOR EACH ROW
      EXECUTE FUNCTION calculate_expires_at();
    
    CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON user_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_sub ON user_sessions(sub);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON user_sessions(created_at);
  `;

    if (client) {
      await client.query(query);
    } else {
      await this.executeQuery(query, [], 'Create user sessions table');
    }
  }

  // Create applications table
 static async createApplicationsTable(client = null) {
    const query = `
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        sub VARCHAR(100) NOT NULL,
        application_id VARCHAR(100) UNIQUE NOT NULL,
        medical_certificate_id VARCHAR(100) NOT NULL,
        
        -- Personal Information
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        date_of_birth DATE NOT NULL,
        gender VARCHAR(20),
        blood_group VARCHAR(10),
        
        -- Medical Certificate Information
        doctor_name VARCHAR(255) NOT NULL,
        hospital VARCHAR(255) NOT NULL,
        issued_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        is_fit_to_drive BOOLEAN DEFAULT true,
        vision VARCHAR(100),
        hearing VARCHAR(100),
        remarks TEXT,
        photo_url TEXT,
        
        -- Test Results (stored as JSONB for flexibility)
        written_test JSONB,
        practical_test JSONB,
        
        -- Application Details
        selected_categories JSONB NOT NULL,
        total_amount DECIMAL(10,2) DEFAULT 0,
        payment_reference_id VARCHAR(100),
        payment_transaction_id VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'cancelled')),
        admin_status VARCHAR(20) DEFAULT 'unverified' CHECK (admin_status IN ('unverified', 'verified', 'on_hold')),
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_applications_app_id ON applications(application_id);
      CREATE INDEX IF NOT EXISTS idx_applications_sub ON applications(sub);
      CREATE INDEX IF NOT EXISTS idx_applications_medical_cert_id ON applications(medical_certificate_id);
      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
      CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
      CREATE INDEX IF NOT EXISTS idx_applications_expiry_date ON applications(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_applications_categories ON applications USING GIN (selected_categories);
      CREATE INDEX IF NOT EXISTS idx_applications_written_test ON applications USING GIN (written_test);
      CREATE INDEX IF NOT EXISTS idx_applications_practical_test ON applications USING GIN (practical_test);
    `;

    if (client) {
      await client.query(query);
    } else {
      await this.executeQuery(query, [], 'Create applications table');
    }
  }

  // Seed default licence categories
  static async seedLicenceCategories(client = null) {
    const categories = [
      {
        category_code: 'A1',
        category_label: 'A1',
        description: 'Light Motor Cycle (up to 125cc)',
        fee: 1500.00,
        min_age: 18,
        vehicle_type: 'Motorcycle'
      },
      {
        category_code: 'A',
        category_label: 'A',
        description: 'Motor Cycle (above 125cc)',
        fee: 1500.00,
        min_age: 18,
        vehicle_type: 'Motorcycle'
      },
      {
        category_code: 'B1',
        category_label: 'B1',
        description: 'Motor Tricycle',
        fee: 2000.00,
        min_age: 18,
        vehicle_type: 'Three-wheeler'
      },
      {
        category_code: 'B',
        category_label: 'B',
        description: 'Light Motor Car (up to 3500 kg)',
        fee: 2500.00,
        min_age: 18,
        vehicle_type: 'Light Vehicle'
      },
      {
        category_code: 'C1',
        category_label: 'C1',
        description: 'Light Motor Lorry (3500 kg to 7500 kg)',
        fee: 3000.00,
        min_age: 21,
        vehicle_type: 'Medium Vehicle'
      },
      {
        category_code: 'C',
        category_label: 'C',
        description: 'Heavy Motor Lorry (above 7500 kg)',
        fee: 3500.00,
        min_age: 25,
        vehicle_type: 'Heavy Vehicle'
      },
      {
        category_code: 'D1',
        category_label: 'D1',
        description: 'Mini Bus (up to 16 passengers)',
        fee: 4000.00,
        min_age: 21,
        vehicle_type: 'Passenger Vehicle'
      },
      {
        category_code: 'D',
        category_label: 'D',
        description: 'Heavy Bus (above 16 passengers)',
        fee: 4500.00,
        min_age: 25,
        vehicle_type: 'Passenger Vehicle'
      }
    ];

    for (const category of categories) {
      const query = `
        INSERT INTO licence_categories (category_code, category_label, description, fee, min_age, vehicle_type) 
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (category_code) 
        DO UPDATE SET 
          category_label = EXCLUDED.category_label,
          description = EXCLUDED.description,
          fee = EXCLUDED.fee,
          min_age = EXCLUDED.min_age,
          vehicle_type = EXCLUDED.vehicle_type,
          updated_at = CURRENT_TIMESTAMP
      `;

      const values = [
        category.category_code,
        category.category_label,
        category.description,
        category.fee,
        category.min_age,
        category.vehicle_type
      ];

      if (client) {
        await client.query(query, values);
      } else {
        await this.executeQuery(query, values, `Seed category ${category.category_code}`);
      }
    }

    this.logOperation('Licence categories seeding', true);
  }

  // Initialize all tables with transaction
  static async initTables() {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Verify database connection first
      await client.query('SELECT 1');

      await this.createTable(client);
      await this.createLicenceCategoriesTable(client);
      await this.createSessionsTable(client);
      await this.createApplicationsTable(client);
      await this.createMedicalCertificatesTable(client); 
      await this.addAdminStatusField(client); 
      await this.seedLicenceCategories(client);

      await client.query('COMMIT');
      this.logOperation('Database tables initialization', true);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logOperation('Database tables initialization', false, error);
      throw new Error(`Failed to initialize database tables: ${error.message}`);
    } finally {
      client.release();
    }
  }


  // Save or update user
  static async saveUser(userData) {
    try {
      const { sub, name, email, phone, date_of_birth, address } = userData;

      // Validate required fields
      this.validateRequiredFields(userData, ['sub', 'name']);

      // Validate email format
      if (!this.isValidEmail(email)) {
        throw new Error('Invalid email format');
      }

      // Validate date format if provided
      if (date_of_birth) {
        const dob = new Date(date_of_birth);
        if (isNaN(dob.getTime())) {
          throw new Error('Invalid date_of_birth format. Use YYYY-MM-DD');
        }
      }

      const query = `
        INSERT INTO users (sub, name, email, phone, date_of_birth, address) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        ON CONFLICT (sub) 
        DO UPDATE SET 
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          date_of_birth = EXCLUDED.date_of_birth,
          address = EXCLUDED.address,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [sub, name, email, phone, date_of_birth, address];
      const result = await this.executeQuery(query, values, 'Save/update user');
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to save user: ${error.message}`);
    }
  }

  // Add method to save medical certificate
  static async saveMedicalCertificate(userId, certificateData) {
    try {
      const {
        certificate_id,
        issued_date,
        expiry_date,
        doctor_name,
        hospital,
        blood_group,
        is_fit_to_drive,
        vision_status,
        hearing_status,
        remarks
      } = certificateData;

      this.validateRequiredFields(certificateData, [
        'certificate_id', 'issued_date', 'expiry_date', 'doctor_name', 'hospital'
      ]);

      const query = `
      INSERT INTO medical_certificates (
        sub, certificate_id, issued_date, expiry_date, doctor_name, hospital,
        blood_group, is_fit_to_drive, vision_status, hearing_status, remarks
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (certificate_id) 
      DO UPDATE SET 
        issued_date = EXCLUDED.issued_date,
        expiry_date = EXCLUDED.expiry_date,
        doctor_name = EXCLUDED.doctor_name,
        hospital = EXCLUDED.hospital,
        blood_group = EXCLUDED.blood_group,
        is_fit_to_drive = EXCLUDED.is_fit_to_drive,
        vision_status = EXCLUDED.vision_status,
        hearing_status = EXCLUDED.hearing_status,
        remarks = EXCLUDED.remarks,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

      const values = [
        userId,
        certificate_id,
        issued_date,
        expiry_date,
        doctor_name,
        hospital,
        blood_group,
        is_fit_to_drive,
        vision_status,
        hearing_status,
        remarks
      ];

      const result = await this.executeQuery(query, values, 'Save medical certificate');
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to save medical certificate: ${error.message}`);
    }
  }

  // Get all active licence categories
  static async getLicenceCategories(options = {}) {
    try {
      const { includeInactive = false } = options;

      let whereClause = '';
      if (!includeInactive) {
        whereClause = 'WHERE is_active = true';
      }

      const query = `
        SELECT 
          category_code as id,
          category_label as label,
          description,
          fee,
          min_age,
          vehicle_type,
          is_active
        FROM licence_categories 
        ${whereClause}
        ORDER BY category_code
      `;

      const result = await this.executeQuery(query, [], 'Get licence categories');
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get licence categories: ${error.message}`);
    }
  }

  // Get licence category by code
  static async getLicenceCategoryByCode(categoryCode) {
    try {
      if (!categoryCode) {
        throw new Error('categoryCode is required');
      }

      const query = `
        SELECT * FROM licence_categories 
        WHERE category_code = $1
      `;

      const result = await this.executeQuery(query, [categoryCode], 'Get licence category by code');

      if (result.rows.length === 0) {
        throw new Error(`Licence category '${categoryCode}' not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to get licence category: ${error.message}`);
    }
  }

  // Add new licence category
  static async addLicenceCategory(categoryData) {
    try {
      const { category_code, category_label, description, fee, min_age, vehicle_type } = categoryData;

      // Validate required fields
      this.validateRequiredFields(categoryData, ['category_code', 'category_label', 'description', 'fee']);

      // Validate fee is positive
      if (fee <= 0) {
        throw new Error('Fee must be a positive number');
      }

      // Validate min_age
      if (min_age && (min_age < 16 || min_age > 100)) {
        throw new Error('Minimum age must be between 16 and 100');
      }

      const query = `
        INSERT INTO licence_categories (category_code, category_label, description, fee, min_age, vehicle_type) 
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [category_code, category_label, description, fee, min_age, vehicle_type];
      const result = await this.executeQuery(query, values, 'Add licence category');
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to add licence category: ${error.message}`);
    }
  }

  // Update licence category
  static async updateLicenceCategory(categoryCode, categoryData) {
    try {
      if (!categoryCode) {
        throw new Error('categoryCode is required');
      }

      const { category_label, description, fee, min_age, vehicle_type, is_active } = categoryData;

      // Validate fee if provided
      if (fee !== undefined && fee <= 0) {
        throw new Error('Fee must be a positive number');
      }

      const query = `
        UPDATE licence_categories 
        SET 
          category_label = COALESCE($1, category_label),
          description = COALESCE($2, description),
          fee = COALESCE($3, fee),
          min_age = COALESCE($4, min_age),
          vehicle_type = COALESCE($5, vehicle_type),
          is_active = COALESCE($6, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE category_code = $7
        RETURNING *
      `;

      const values = [category_label, description, fee, min_age, vehicle_type, is_active, categoryCode];
      const result = await this.executeQuery(query, values, 'Update licence category');

      if (result.rows.length === 0) {
        throw new Error(`Licence category '${categoryCode}' not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update licence category: ${error.message}`);
    }
  }

  // Delete licence category (soft delete by setting is_active = false)
  static async deleteLicenceCategory(categoryCode) {
    try {
      if (!categoryCode) {
        throw new Error('categoryCode is required');
      }

      const query = `
        UPDATE licence_categories 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE category_code = $1
        RETURNING *
      `;

      const result = await this.executeQuery(query, [categoryCode], 'Delete licence category');

      if (result.rows.length === 0) {
        throw new Error(`Licence category '${categoryCode}' not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to delete licence category: ${error.message}`);
    }
  }

  // Save user session
  // Save user session - UPDATED
  static async saveUserSession(userId, sessionData) {
    try {
      const { session_id, access_token, token_type, expires_in = 3600, scope } = sessionData;

      // Validate required fields
      this.validateRequiredFields(sessionData, ['session_id', 'access_token']);

      const query = `
      INSERT INTO user_sessions (sub, session_id, access_token, token_type, expires_in, scope) 
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (session_id) 
      DO UPDATE SET 
        access_token = EXCLUDED.access_token,
        token_type = EXCLUDED.token_type,
        expires_in = EXCLUDED.expires_in,
        scope = EXCLUDED.scope,
        created_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

      const values = [userId, session_id, access_token, token_type, expires_in, scope];
      const result = await this.executeQuery(query, values, 'Save user session');
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to save user session: ${error.message}`);
    }
  }
  // Save application
 static async saveApplication(applicationData) {
    try {
      const {
        sub,
        application_id,
        medical_certificate_id,
        selectCategories,
        status = 'pending',
        
        // Personal Information
        fullName,
        email,
        phone,
        dob,
        gender,
        bloodGroup,
        
        // Medical Certificate Information
        doctorName,
        hospital,
        issuedDate,
        expiryDate,
        isFitToDrive,
        vision,
        hearing,
        remarks,
        photoUrl,
        
        // Test Results
        writtenTest,
        practicalTest,
        
        // Payment Information (optional)
        total_amount = 0,
        payment_reference_id = null,
        payment_transaction_id = null
      } = applicationData;

      // Validate required fields
      this.validateRequiredFields(applicationData, [
        'sub', 
        'application_id', 
        'selectCategories',
        'fullName',
        'email',
        'dob',
        'doctorName',
        'hospital',
        'issuedDate',
        'expiryDate'
      ]);

      // Validate selectCategories is valid JSON object/array
      if (!Array.isArray(selectCategories) && typeof selectCategories !== 'object') {
        throw new Error('selected_categories must be a valid array or JSON object');
      }

      // Validate total_amount is non-negative
      if (total_amount < 0) {
        throw new Error('Total amount must be a non-negative number');
      }

      // Validate status
      const validStatuses = ['pending', 'submitted', 'approved', 'rejected', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // Validate test results structure
      if (writtenTest && typeof writtenTest !== 'object') {
        throw new Error('writtenTest must be a valid JSON object');
      }

      if (practicalTest && typeof practicalTest !== 'object') {
        throw new Error('practicalTest must be a valid JSON object');
      }

      const query = `
        INSERT INTO applications (
          sub, application_id, medical_certificate_id, 
          selected_categories, status, total_amount, payment_reference_id,
          payment_transaction_id, full_name, email, phone, date_of_birth, gender,
          blood_group, doctor_name, hospital, issued_date, expiry_date,
          is_fit_to_drive, vision, hearing, remarks, photo_url,
          written_test, practical_test
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        RETURNING *
      `;

      const values = [
        sub,
        application_id,
        medical_certificate_id,
        JSON.stringify(selectCategories),
        status,
        total_amount,
        payment_reference_id,
        payment_transaction_id,
        fullName,
        email,
        phone,
        dob,
        gender,
        bloodGroup,
        doctorName,
        hospital,
        issuedDate,
        expiryDate,
        isFitToDrive,
        vision,
        hearing,
        remarks,
        photoUrl,
        writtenTest ? JSON.stringify(writtenTest) : null,
        practicalTest ? JSON.stringify(practicalTest) : null
      ];

      const result = await this.executeQuery(query, values, 'Save application');
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to save application: ${error.message}`);
    }
  }

  // Find user by subject identifier
  static async findBySub(sub) {
    try {
      if (!sub) {
        throw new Error('sub is required');
      }

      const query = `
        SELECT 
          id, sub, name, email, phone, date_of_birth, address, 
          created_at, updated_at 
        FROM users 
        WHERE sub = $1
      `;

      const result = await this.executeQuery(query, [sub], 'Find user by sub');
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }

  // Find application by ID
  static async findApplicationById(applicationId) {
    try {
      if (!applicationId) {
        throw new Error('applicationId is required');
      }

      const query = `
        SELECT 
          a.*, 
          u.sub, u.name, u.email, u.phone,
          u.date_of_birth, u.address
        FROM applications a 
        JOIN users u ON a.sub = u.sub
        WHERE a.application_id = $1
      `;

      const result = await this.executeQuery(query, [applicationId], 'Find application by ID');

      if (result.rows.length === 0) {
        throw new Error(`Application '${applicationId}' not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to find application: ${error.message}`);
    }
  }

  // Get user applications
  static async getUserApplications(sub, options = {}) {
    try {
      if (!sub) {
        throw new Error('sub is required');
      }

      const { limit = 50, offset = 0, status } = options;
      let whereClause = 'WHERE u.sub = $1';
      const values = [sub];
      let paramCount = 1;

      if (status) {
        paramCount++;
        whereClause += ` AND a.status = $${paramCount}`;
        values.push(status);
      }

      const query = `
        SELECT 
          a.*,
          (SELECT COUNT(*) FROM applications a2 JOIN users u2 ON a2.sub = u2.sub WHERE u2.sub = $1 ${status ? `AND a2.status = $${paramCount}` : ''}) as total_count
        FROM applications a 
        JOIN users u ON a.sub = u.sub
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      values.push(limit, offset);
      const result = await this.executeQuery(query, values, 'Get user applications');
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get user applications: ${error.message}`);
    }
  }

  // Clean up expired sessions
  static async cleanupExpiredSessions() {
    try {
      const query = `
      DELETE FROM user_sessions 
      WHERE expires_at < CURRENT_TIMESTAMP
      OR created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      RETURNING session_id
    `;

      const result = await this.executeQuery(query, [], 'Cleanup expired sessions');
      this.logOperation(`Cleaned up ${result.rows.length} expired sessions`, true);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to cleanup expired sessions: ${error.message}`);
    }
  }

  // Update application status
  static async updateApplicationStatus(applicationId, status) {
    try {
      if (!applicationId || !status) {
        throw new Error('applicationId and status are required');
      }

      const validStatuses = ['pending', 'submitted', 'approved', 'rejected', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const query = `
        UPDATE applications 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE application_id = $2
        RETURNING *
      `;

      const result = await this.executeQuery(query, [status, applicationId], 'Update application status');

      if (result.rows.length === 0) {
        throw new Error(`Application '${applicationId}' not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update application status: ${error.message}`);
    }
  }

  // Create medical certificates table
  static async createMedicalCertificatesTable(client = null) {
    const query = `
    CREATE TABLE IF NOT EXISTS medical_certificates (
      id SERIAL PRIMARY KEY,
      sub VARCHAR(100) REFERENCES users(sub) ON DELETE CASCADE,
      certificate_id VARCHAR(100) UNIQUE NOT NULL,
      issued_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      doctor_name VARCHAR(255) NOT NULL,
      hospital VARCHAR(255) NOT NULL,
      blood_group VARCHAR(10),
      is_fit_to_drive BOOLEAN DEFAULT true,
      vision_status TEXT,
      hearing_status TEXT,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_medical_certificates_sub ON medical_certificates(sub);
    CREATE INDEX IF NOT EXISTS idx_medical_certificates_certificate_id ON medical_certificates(certificate_id);
    CREATE INDEX IF NOT EXISTS idx_medical_certificates_expiry_date ON medical_certificates(expiry_date);
  `;

    if (client) {
      await client.query(query);
    } else {
      await this.executeQuery(query, [], 'Create medical certificates table');
    }
  }

    /**
   * Retrieves the count of all applications, categorized by status.
   * @returns {object} An object containing total, pending, approved, and rejected counts.
   */
  static async getApplicationStats() {
    const query = `
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected,
        COUNT(id) AS total
      FROM applications;
    `;

    try {
      const result = await this.executeQuery(query, [], 'Get application statistics');
      const stats = result.rows[0];
      
      // PostgreSQL returns counts as strings, convert to numbers
      return {
        total: parseInt(stats.total, 10) || 0,
        pending: parseInt(stats.pending, 10) || 0,
        approved: parseInt(stats.approved, 10) || 0,
        rejected: parseInt(stats.rejected, 10) || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get application stats: ${error.message}`);
    }
  }
}

module.exports = User;