import pgClient from '../db/pgClient.js';

/**
 * Creates a user with login details using PostgreSQL transaction
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createUser = async (req, res) => {
    const { email, emp_code, password, user_type } = req.body;

    if (!email || !emp_code || !password || !user_type) {
        return res.status(400).send({ msg: "Please provide all fields." });
    }

    const insertUserQuery =
        `INSERT INTO tbl_user (user_empcode, user_email, user_type)
         VALUES ($1, $2, $3);`;

    const insertLoginQuery =
        `INSERT INTO tbl_login (user_email, password)
         VALUES ($1, $2);`;

    try {
        await pgClient.query('BEGIN');
        await pgClient.query(insertUserQuery, [
            emp_code,
            email,
            user_type
        ]);
        await pgClient.query(insertLoginQuery, [
            email,
            password
        ]);
        await pgClient.query('COMMIT');

        return res.status(201).send({ msg: 'User created successfully' });

    } catch (error) {
        await pgClient.query('ROLLBACK');
        console.error(error);

        return res.status(500).send({
            msg: 'Transaction failed',
            error: error.message
        });

    }
};

/**
 * User login controller
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const userLogin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            msg: 'Email and password are required'
        });
    }

    const loginQuery = `
        SELECT 
            u.user_empcode,
            u.user_email,
            u.user_type,
            l.password
        FROM tbl_login l
        JOIN tbl_user u ON u.user_email = l.user_email
        WHERE l.user_email = $1
        LIMIT 1;
    `;

    try {
        const { rows } = await pgClient.query(loginQuery, [email]);

        if (rows.length === 0) {
            return res.status(401).json({
                msg: 'Invalid email or password'
            });
        }

        const user = rows[0];
        if(user.password!==password){
            return res.status(400).send({msg:"Invalid credentials."});
        }

        // Remove password before sending response
        delete user.password;

        return res.status(200).json({
            msg: 'Login successful',
            user
        });

    } catch (error) {
        return res.status(500).json({
            msg: 'Login failed',
            error: error.message
        });
    }
};



export {createUser,userLogin};