const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: true
}));

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'adam123',
    database: 'database_website'
});

db.connect(err => {
    if (err) throw err;
    console.log('MySQL Connected...');
});

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Use memory storage for simplicity
const upload = multer({ storage: storage });

// Serve the login page
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'user') {
            return res.redirect('/dashboard_user');
        } else if (req.session.user.role === 'admin') {
            return res.redirect('/dashboard_admin');
        }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(__dirname + '/public/login.html');
});

// User Login
app.post('/login_user', (req, res) => {
    const { user_id, password } = req.body;
    const query = 'SELECT * FROM users WHERE user_id = ?';
    db.query(query, [user_id], (err, result) => {
        if (err) throw err;
        if (result.length > 0) {
            const user = result[0];
            if (bcrypt.compareSync(password, user.password)) {
                req.session.user = { id: user.id, role: 'user' };
                return res.redirect('/dashboard_user');
            }
        }
        res.send('Invalid User Credentials');
    });
});

// Admin Login
app.post('/login_admin', (req, res) => {
    const { admin_id, password } = req.body;
    const query = 'SELECT * FROM admins WHERE user_id = ?';
    db.query(query, [admin_id], (err, result) => {
        if (err) throw err;
        if (result.length > 0) {
            const admin = result[0];
            if (password === admin.password) {
                req.session.user = { id: admin.id, role: 'admin' };
                return res.redirect('/dashboard_admin');
            }
        }
        res.send('Invalid Admin Credentials');
    });
});

// New User Registration
app.post('/register_user', (req, res) => {
    const { user_id, username, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.send('Passwords do not match');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const query = 'INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)';

    db.query(query, [user_id, username, hashedPassword], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.send('User ID already exists. Please choose a different User ID.');
            }
            throw err;
        }
        res.send('New User Registered Successfully');
    });
});

// User Dashboard
app.get('/dashboard_user', (req, res) => {
    if (req.session.user && req.session.user.role === 'user') {
        return res.sendFile(__dirname + '/public/dashboard_user.html');
    } else {
        return res.redirect('/');
    }
});

// Admin Dashboard
app.get('/dashboard_admin', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return res.sendFile(__dirname + '/public/dashboard_admin.html');
    } else {
        return res.redirect('/');
    }
});

// KYC Submission
app.post('/submit_kyc', upload.fields([
    { name: 'labour_license' },
    { name: 'agreement_bond' },
    { name: 'bank_details' }
]), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') {
        return res.status(403).send('You are not authorized to submit KYC data.');
    }

    const userId = req.session.user.id;
    const {
        company_name,
        gstin,
        mobile_no,
        email,
        address,
        owner_name,
        pan_no,
        aadhar_no,
        employees,
        turnover
    } = req.body;

    if (!req.files || !req.files['labour_license'] || !req.files['agreement_bond'] || !req.files['bank_details']) {
        return res.status(400).send('Please upload all required documents.');
    }

    const labourLicense = req.files['labour_license'][0].buffer;
    const agreementBond = req.files['agreement_bond'][0].buffer;
    const bankDetails = req.files['bank_details'][0].buffer;

    const userQuery = `
        UPDATE users 
        SET company_name = ?, 
            gstin = ?, 
            contact = ?, 
            address = ?, 
            email = ?, 
            employees = ?, 
            turnover = ?, 
            owner_name = ?, 
            pan_card = ?, 
            aadhar_card = ?, 
            labour_license = ?, 
            agreement_bond = ?, 
            bank_details = ? 
        WHERE id = ?`;

    db.query(userQuery, [company_name, gstin, mobile_no, address, email, employees, turnover, owner_name, pan_no, aadhar_no, labourLicense, agreementBond, bankDetails, userId], (err) => {
        if (err) {
            console.error('Error updating user data:', err);
            return res.status(500).send('Error saving user data');
        }
        res.send('KYC data submitted successfully!');
    });
});

// Report Submission
app.post('/submit_report', upload.single('report_document'), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') {
        return res.status(403).send('You are not authorized to submit reports.');
    }

    const userId = req.session.user.id;
    const reportDate = new Date();
    const reportDocument = req.file.buffer;

    const reportQuery = `
        UPDATE users 
        SET report_date = ?, 
            report_document = ? 
        WHERE id = ?`;

    db.query(reportQuery, [reportDate, reportDocument, userId], (err) => {
        if (err) {
            console.error('Error submitting report:', err);
            return res.status(500).send('Error saving report');
        }
        res.send('Report submitted successfully!');
    });
});

// Logout Route
app.get('/logout', (req, res) => {
    // Destroy the session to log the user out
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        // Redirect to the login page after successful logout
        res.redirect('/#home');
    });
});

// Get KYC Submissions (Users who haven't had KYC approved yet)
app.get('/api/get_kyc_submissions', (req, res) => {
    const query = 'SELECT user_id, username, company_name FROM users WHERE kyc_approved = FALSE';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching KYC submissions:', err);
            return res.status(500).json({ message: 'Error fetching KYC submissions' });
        }
        res.json(results);
    });
});

// Approve KYC
app.post('/api/approve_kyc/:userId', (req, res) => {
    const { userId } = req.params;
    const query = 'UPDATE users SET kyc_approved = TRUE WHERE user_id = ?';

    db.query(query, [userId], (err) => {
        if (err) {
            console.error('Error approving KYC:', err);
            return res.status(500).json({ message: 'Error approving KYC' });
        }
        res.json({ message: 'KYC approved successfully' });
    });
});

// Disapprove KYC
app.post('/api/disapprove_kyc/:userId', (req, res) => {
    const { userId } = req.params;
    const query = 'UPDATE users SET kyc_approved = FALSE WHERE user_id = ?';

    db.query(query, [userId], (err) => {
        if (err) {
            console.error('Error disapproving KYC:', err);
            return res.status(500).json({ message: 'Error disapproving KYC' });
        }
        res.json({ message: 'KYC disapproved' });
    });
});

// View Document Endpoint (for downloading files)
app.get('/api/view_document/:userId/:documentType', (req, res) => {
    const { userId, documentType } = req.params;
    const query = `SELECT ${documentType} FROM users WHERE user_id = ?`;

    db.query(query, [userId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error fetching document:', err);
            return res.status(500).send('Document not found');
        }
        const document = results[0][documentType];
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=${documentType}.pdf`);
        res.send(document);
    });
});


// Get available schemes
app.get('/api/get_schemes', (req, res) => {
    const query = 'SELECT scheme_id, name, description FROM schemes';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching schemes:', err);
            return res.status(500).json({ message: 'Error fetching schemes' });
        }
        res.json(results);
    });
});
// Apply for a scheme
app.post('/api/apply_scheme/:schemeId', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'user') {
        return res.status(403).send('Unauthorized');
    }

    const userId = req.session.user.user_id; // Ensure this matches your session structure
    const { schemeId } = req.params;
    const schemeName = req.body.schemeName; // Expect scheme name in request body

    // Capture other user details from request body
    const companyName = req.body.companyName;
    const contactNumber = req.body.contactNumber;
    const email = req.body.contactEmail;

    // Query to insert the application into the database
    const applicationQuery = `
        INSERT INTO scheme_applications (user_id, scheme_id, scheme_name, company_name, contact_number, contact_email) 
        VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(applicationQuery, [userId, schemeId, schemeName, companyName, contactNumber, email], (err, result) => {
        if (err) {
            console.error('Error applying for scheme:', err);
            return res.status(500).send('Error applying for the scheme');
        }

        res.json({ message: 'Successfully applied for the scheme', applicationId: result.insertId });
    });
});

// Get scheme applications (for admin view)
app.get('/api/get_scheme_applications', (req, res) => {
    const query = `
        SELECT 
            u.user_id AS userId, 
            sa.application_id AS applicationId,
            sa.scheme_id AS schemeId, 
            sa.scheme_name AS schemeName, 
            u.company_name AS companyName,
            u.contact_number AS contactNumber,
            u.contact_email AS email,
            sa.status AS status
        FROM 
            scheme_applications sa 
        JOIN 
            users u ON sa.user_id = u.user_id`; // Join with users table to get user details

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching scheme applications:', err);
            return res.status(500).json({ message: 'Error fetching scheme applications' });
        }
        res.json(results);
    });
});

// Approve scheme application
app.post('/api/approve_scheme/:applicationId', (req, res) => {
    const { applicationId } = req.params;

    // Query to update the application status to "approved"
    const query = 'UPDATE scheme_applications SET status = "approved" WHERE application_id = ?';

    db.query(query, [applicationId], (err, result) => {
        if (err) {
            console.error('Error approving scheme application:', err);
            return res.status(500).json({ message: 'Error approving scheme application' });
        }

        // Check if any rows were affected
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // Return a success message along with the updated application details
        res.json({ message: 'Scheme application approved', applicationId });
    });
});

// Disapprove scheme application
app.post('/api/disapprove_scheme/:applicationId', (req, res) => {
    const { applicationId } = req.params;

    // Query to update the application status to "disapproved"
    const query = 'UPDATE scheme_applications SET status = "disapproved" WHERE application_id = ?';

    db.query(query, [applicationId], (err, result) => {
        if (err) {
            console.error('Error disapproving scheme application:', err);
            return res.status(500).json({ message: 'Error disapproving scheme application' });
        }

        // Check if any rows were affected
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // Return a success message along with the updated application details
        res.json({ message: 'Scheme application disapproved', applicationId });
    });
});


// Start Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/#home`);
});