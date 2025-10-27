const express = require('express');
const router = express.Router();
const User = require('../models/userModel');

// --- Swagger Definitions (Schemas, Parameters, Tags) ---

/**
 * @swagger
 * components:
 *   schemas:
 *     Application:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the application.
 *         application_id:
 *           type: string
 *           description: The unique application identifier.
 *         medical_certificate_id:
 *           type: string
 *           description: The linked medical certificate ID.
 *         sub:
 *           type: string
 *           description: The user's unique subject identifier.
 *         full_name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         date_of_birth:
 *           type: string
 *           format: date
 *         gender:
 *           type: string
 *         blood_group:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, submitted, approved, rejected, cancelled]
 *           description: The current status of the application.
 *         selected_categories:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               label:
 *                 type: string
 *         written_test:
 *           type: object
 *           properties:
 *             score:
 *               type: number
 *             passed:
 *               type: boolean
 *         practical_test:
 *           type: object
 *           properties:
 *             score:
 *               type: number
 *             passed:
 *               type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *       example:
 *         id: 1
 *         application_id: "APP001"
 *         medical_certificate_id: "MED001"
 *         sub: "user123"
 *         full_name: "John Doe"
 *         email: "john@example.com"
 *         status: "approved"
 *         selected_categories: [{ "code": "B", "label": "Car" }]
 *     Pagination:
 *       type: object
 *       properties:
 *         currentPage:
 *           type: integer
 *         totalPages:
 *           type: integer
 *         totalCount:
 *           type: integer
 *         hasNext:
 *           type: boolean
 *         hasPrev:
 *           type: boolean
 *   parameters:
 *     AppIdParam:
 *       in: path
 *       name: id
 *       schema:
 *         type: string
 *       required: true
 *       description: The application ID, primary ID, or medical certificate ID
 */

/**
 * @swagger
 * tags:
 *   - name: Applications
 *     description: Application management and retrieval
 *   - name: Test
 *     description: Test-only endpoints
 */

// --- End Swagger Definitions ---

/**
 * @swagger
 * /admin/aapi/applications:
 *   get:
 *     summary: Retrieve a list of applications
 *     description: Get all applications with pagination and filtering.
 *     tags: [Applications]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         default: 100
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, pending, submitted, approved, rejected, cancelled]
 *         description: Filter by application status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for application ID, name, email, etc.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         default: created_at
 *         description: Column to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         default: DESC
 *         description: Sort order
 *     responses:
 *       '200':
 *         description: A list of applications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Application'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 100,
      status, 
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build base query - only from applications table
    let query = `
      SELECT 
        a.id,
        a.sub,
        a.application_id,
        a.medical_certificate_id,
        a.full_name,
        a.email,
        a.phone,
        a.date_of_birth,
        a.gender,
        a.blood_group,
        a.doctor_name,
        a.hospital,
        a.issued_date,
        a.expiry_date,
        a.is_fit_to_drive,
        a.vision,
        a.hearing,
        a.remarks,
        a.photo_url,
        a.written_test,
        a.practical_test,
        a.selected_categories,
        a.total_amount,
        a.payment_reference_id,
        a.payment_transaction_id,
        a.status,
        a.created_at,
        a.updated_at
      FROM applications a
      WHERE 1=1
    `;

    let countQuery = `
      SELECT COUNT(*) 
      FROM applications a
      WHERE 1=1
    `;

    const whereConditions = [];
    const queryParams = [];

    // Add filters
    if (status && status !== 'all') {
      whereConditions.push(`a.status = $${whereConditions.length + 1}`);
      queryParams.push(status);
    }

    if (search) {
      whereConditions.push(`(
        a.application_id ILIKE $${whereConditions.length + 1} OR
        a.medical_certificate_id ILIKE $${whereConditions.length + 1} OR
        a.sub ILIKE $${whereConditions.length + 1} OR
        a.full_name ILIKE $${whereConditions.length + 1} OR
        a.email ILIKE $${whereConditions.length + 1}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Add WHERE clause if needed
    if (whereConditions.length > 0) {
      const whereClause = ' AND ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // Add sorting
    const validSortColumns = ['created_at', 'updated_at', 'full_name', 'status', 'expiry_date', 'application_id', 'medical_certificate_id'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY a.${sortColumn} ${order}`;

    // Add pagination
    query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(parseInt(limit), offset);

    try {
      // Execute queries
      const [applicationsResult, countResult] = await Promise.all([
        User.executeQuery(query, queryParams, 'Get applications'),
        User.executeQuery(countQuery, queryParams.slice(0, -2), 'Count applications')
      ]);

      const totalCount = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalCount / limit);

      // Parse JSONB fields
      const applications = applicationsResult.rows.map(app => {
        if (app.selected_categories && typeof app.selected_categories === 'string') {
          app.selected_categories = JSON.parse(app.selected_categories);
        }
        if (app.written_test && typeof app.written_test === 'string') {
          app.written_test = JSON.parse(app.written_test);
        }
        if (app.practical_test && typeof app.practical_test === 'string') {
          app.practical_test = JSON.parse(app.practical_test);
        }
        return app;
      });

      res.json({
        applications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (dbError) {
      // If there's an error with the main query, try a simpler approach
      console.log('Falling back to simple applications query');
      const simpleQuery = 'SELECT * FROM applications ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      const simpleCountQuery = 'SELECT COUNT(*) FROM applications';
      
      const [applicationsResult, countResult] = await Promise.all([
        User.executeQuery(simpleQuery, [limit, offset], 'Get applications simple'),
        User.executeQuery(simpleCountQuery, [], 'Count applications simple')
      ]);

      const totalCount = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalCount / limit);

      // Parse JSONB fields for simple query results too
      const applications = applicationsResult.rows.map(app => {
        if (app.selected_categories && typeof app.selected_categories === 'string') {
          app.selected_categories = JSON.parse(app.selected_categories);
        }
        if (app.written_test && typeof app.written_test === 'string') {
          app.written_test = JSON.parse(app.written_test);
        }
        if (app.practical_test && typeof app.practical_test === 'string') {
          app.practical_test = JSON.parse(app.practical_test);
        }
        return app;
      });

      res.json({
        applications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    }

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/aapi/applications/stats:
 *   get:
 *     summary: Get application statistics (deprecated)
 *     description: Note - This endpoint seems to be an older version of /stats/summary
 *     tags: [Applications]
 *     responses:
 *       '200':
 *         description: Statistics object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *       '500':
 *         description: Internal server error
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await User.getApplicationStats();
    res.json({ stats });
  } catch (error) {
    // Forward error to Express error handler
    next(error); 
  }
});

/**
 * @swagger
 * /admin/aapi/applications/{id}:
 *   get:
 *     summary: Get a single application by ID
 *     description: Fetches an application by its primary ID, application_id, or medical_certificate_id.
 *     tags: [Applications]
 *     parameters:
 *       - $ref: '#/components/parameters/AppIdParam'
 *     responses:
 *       '200':
 *         description: The application object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Application'
 *       '404':
 *         description: Application not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find by application_id, id, or medical_certificate_id
    const query = `
      SELECT *
      FROM applications
      WHERE application_id = $1 OR id::text = $1 OR medical_certificate_id = $1
      LIMIT 1
    `;
    const result = await User.executeQuery(query, [id], 'Find application by ID, application_id, or medical_certificate_id');
    const application = result.rows[0];
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Parse JSONB fields
    if (application.selected_categories && typeof application.selected_categories === 'string') {
      application.selected_categories = JSON.parse(application.selected_categories);
    }
    if (application.written_test && typeof application.written_test === 'string') {
      application.written_test = JSON.parse(application.written_test);
    }
    if (application.practical_test && typeof application.practical_test === 'string') {
      application.practical_test = JSON.parse(application.practical_test);
    }

    res.json(application);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/aapi/applications/{id}/status:
 *   patch:
 *     summary: Update an application's status
 *     tags: [Applications]
 *     parameters:
 *       - $ref: '#/components/parameters/AppIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, submitted, approved, rejected, cancelled]
 *             required:
 *               - status
 *           example:
 *             status: "approved"
 *     responses:
 *       '200':
 *         description: Application status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 application:
 *                   $ref: '#/components/schemas/Application'
 *       '400':
 *         description: Invalid or missing status
 *       '404':
 *         description: Application not found
 *       '500':
 *         description: Internal server error
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'submitted', 'approved', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Update by application_id, id, or medical_certificate_id
    const query = `
      UPDATE applications 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE application_id = $2 OR id::text = $2 OR medical_certificate_id = $2
      RETURNING *
    `;

    const result = await User.executeQuery(query, [status, id], 'Update application status');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const updatedApplication = result.rows[0];
    
    res.json({
      message: 'Application status updated successfully',
      application: updatedApplication
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/aapi/applications/{id}:
 *   put:
 *     summary: Update application details
 *     description: Updates multiple fields of an application. Note - this allows partial updates.
 *     tags: [Applications]
 *     parameters:
 *       - $ref: '#/components/parameters/AppIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Application'
 *     responses:
 *       '200':
 *         description: Application updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 application:
 *                   $ref: '#/components/schemas/Application'
 *       '400':
 *         description: No valid fields to update
 *       '404':
 *         description: Application not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Build update query dynamically
    const allowedFields = [
      'full_name', 'email', 'phone', 'date_of_birth', 'gender', 'blood_group',
      'doctor_name', 'hospital', 'issued_date', 'expiry_date', 'is_fit_to_drive',
      'vision', 'hearing', 'remarks', 'photo_url', 'written_test', 'practical_test',
      'selected_categories', 'total_amount', 'payment_reference_id', 'payment_transaction_id', 'status'
    ];

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateFields.push(`${field} = $${paramCount}`);
        
        // Handle JSONB fields
        if (field === 'written_test' || field === 'practical_test' || field === 'selected_categories') {
          values.push(updateData[field] ? JSON.stringify(updateData[field]) : null);
        } else {
          values.push(updateData[field]);
        }
        
        paramCount++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE applications 
      SET ${updateFields.join(', ')}
      WHERE application_id = $${paramCount} OR id::text = $${paramCount} OR medical_certificate_id = $${paramCount}
      RETURNING *
    `;

    const result = await User.executeQuery(query, values, 'Update application');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({
      message: 'Application updated successfully',
      application: result.rows[0]
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/aapi/applications/stats/summary:
 *   get:
 *     summary: Get application statistics summary
 *     description: Returns a count of applications grouped by status.
 *     tags: [Applications]
 *     responses:
 *       '200':
 *         description: Statistics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 byStatus:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *             example:
 *               total: 150
 *               byStatus:
 *                 approved: 50
 *                 pending: 75
 *                 rejected: 25
 *       '500':
 *         description: Internal server error
 */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM applications 
      GROUP BY status
      ORDER BY count DESC
    `;

    const result = await User.executeQuery(query, [], 'Get application stats');

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const stats = {
      total,
      byStatus: result.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {})
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/aapi/applications/user/{sub}:
 *   get:
 *     summary: Get applications by user 'sub'
 *     description: Retrieves a paginated list of applications for a specific user subject (sub).
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: sub
 *         schema:
 *           type: string
 *         required: true
 *         description: The user's subject identifier
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         default: 10
 *         description: Number of items per page
 *     responses:
 *       '200':
 *         description: A list of the user's applications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Application'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       '500':
 *         description: Internal server error
 */
router.get('/user/:sub', async (req, res, next) => {
  try {
    const { sub } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const offset = (page - 1) * limit;

    const query = `
      SELECT * FROM applications 
      WHERE sub = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) FROM applications WHERE sub = $1
    `;

    const [applicationsResult, countResult] = await Promise.all([
      User.executeQuery(query, [sub, parseInt(limit), offset], 'Get user applications'),
      User.executeQuery(countQuery, [sub], 'Count user applications')
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Parse JSONB fields
    const applications = applicationsResult.rows.map(app => {
      if (app.selected_categories && typeof app.selected_categories === 'string') {
        app.selected_categories = JSON.parse(app.selected_categories);
      }
      if (app.written_test && typeof app.written_test === 'string') {
        app.written_test = JSON.parse(app.written_test);
      }
      if (app.practical_test && typeof app.practical_test === 'string') {
        app.practical_test = JSON.parse(app.practical_test);
      }
      return app;
    });

    res.json({
      applications,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/aapi/applications/test/data:
 *   get:
 *     summary: Get sample test data
 *     description: Returns a fixed set of sample application data for testing.
 *     tags: [Test]
 *     responses:
 *       '200':
 *         description: A list of sample applications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Application'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       '500':
 *         description: Internal server error
 */
router.get('/test/data', async (req, res) => {
  try {
    // Return sample data for testing
    const sampleData = [
      {
        id: 1,
        sub: 'user123',
        application_id: 'APP001',
        medical_certificate_id: 'MED001',
        full_name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        date_of_birth: '1990-01-01',
        gender: 'Male',
        blood_group: 'O+',
        doctor_name: 'Dr. Smith',
        hospital: 'City Hospital',
        issued_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_fit_to_drive: true,
        vision: '20/20',
        hearing: 'Normal',
        remarks: 'No issues',
        photo_url: null,
        written_test: { score: 85, passed: true },
        practical_test: { score: 90, passed: true },
        selected_categories: [{ code: 'B', label: 'Car' }],
        total_amount: 150.00,
        payment_reference_id: 'PAY001',
        payment_transaction_id: 'TXN001',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        sub: 'user456',
        application_id: 'APP002',
        medical_certificate_id: 'MED002',
        full_name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+0987654321',
        date_of_birth: '1992-05-15',
        gender: 'Female',
        blood_group: 'A+',
        doctor_name: 'Dr. Johnson',
        hospital: 'General Hospital',
        issued_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_fit_to_drive: true,
        vision: '20/20',
        hearing: 'Normal',
        remarks: 'All clear',
        photo_url: null,
        written_test: { score: 92, passed: true },
        practical_test: { score: 88, passed: true },
        selected_categories: [{ code: 'A', label: 'Motorcycle' }, { code: 'B', label: 'Car' }],
        total_amount: 200.00,
        payment_reference_id: 'PAY002',
        payment_transaction_id: 'TXN002',
        status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    res.json({
      applications: sampleData,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCount: 2,
        hasNext: false,
        hasPrev: false
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;