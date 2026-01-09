import pgClient from "../db/pgClient.js";

const createAdminLog = async (log_statement, action_performed_by) => {
  if (!log_statement || !action_performed_by) {
    return;
  }

  try {
    const query = `
      INSERT INTO tbl_log
      (log_statement, action_performed_by)
      VALUES ($1, $2);
    `;

    await pgClient.query(query, [
      log_statement,
      action_performed_by
    ]);
  } catch (error) {
    console.log(error);
  }
};

export default createAdminLog;
