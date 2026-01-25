import pgClient from '../db/pgClient.js';
const accessColName='access_modification';
/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const verifyAction = async (req, res, next) => {
    /** @type {{user_code:String,action:String}} */
    const { user_code, action } = req.body;
    if(!user_code || user_code.trim()=="" || !action || action.trim()==""){
        return res.status(400).send({msg:"User name and action not specified."});
    }
    const colName =action===accessColName? accessColName: `can_${action.toLocaleLowerCase()}`
    const getAccessDetalisQ = `SELECT ${colName} from tbl_user where user_empcode=$1;`;
    try {
        const { rowCount, rows } = await pgClient.query(getAccessDetalisQ, [user_code]);
        if (rowCount == 0) {
            return res.status(400).send({ msg: "Invalid user or action." });
        }
        if (rows[0][colName] == "YES") {
            next();
        }
        else{

            return res.status(400).send({ msg: `You does not have ${action} permission.` });
        }
        
    } catch (error) {
        console.log(error);
        return res.status(500).send({ msg: 'Error: ' + error });
    }
}
/**
* Assigns line item type
* @param {import('express').Request} req - Express request
* @param {import('express').Response} res - Express response
*/
const verifySuperAdmin = async (req, res, next) => {
    /** @type {{user_code:String,action:String}} */
    const { user_code, action } = req.body;
    if(!user_code || user_code.trim()=="" || !action || action.trim()==""){
        return res.status(400).send({msg:"User name and ation not specified."});
    }
    
    const getSuperAdminData='select '

    try {
        const { rowCount, rows } = await pgClient.query(getAccessDetalisQ, [user_code]);
        if (rowCount == 0) {
            return res.status(400).send({ msg: "Invalid user or action." });
        }
        if (rows[0][colName] == "YES") {
            next();
        }
        else{

            return res.status(400).send({ msg: `You does not have ${action} permission.` });
        }
        
    } catch (error) {
        console.log(error);
        return res.status(500).send({ msg: 'Error: ' + error });
    }
}

export {verifyAction,verifySuperAdmin};