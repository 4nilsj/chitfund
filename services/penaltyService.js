const db = require("../config/database");
const cron = require("node-cron");
const { logAudit } = require("../utils/helpers");

const assessLatePenalties = async (month) => {
  try {
    const penaltyAmountSetting = await db.get(
      "SELECT value FROM settings WHERE key = 'penalty_amount'",
    );
    const penaltyAmount = penaltyAmountSetting
      ? parseFloat(penaltyAmountSetting.value)
      : 100.0;

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    // Get active regular members
    const members = await db.all(
      "SELECT id, name FROM members WHERE status = 'active' AND type = 'member'",
    );

    let assessedCount = 0;

    for (const member of members) {
      // Check if they paid contribution for this month
      const hasContribution = await db.get(
        "SELECT id FROM transactions WHERE member_id = ? AND type = 'contribution' AND payment_batch_id = ?",
        [member.id, targetMonth],
      );

      if (!hasContribution) {
        // Check if penalty already assessed
        const existingPenalty = await db.get(
          "SELECT id FROM transactions WHERE member_id = ? AND type = 'penalty' AND remarks LIKE ?",
          [member.id, `Late payment penalty for ${targetMonth}%`],
        );

        if (!existingPenalty) {
          const todayStr = new Date().toISOString().split("T")[0];
          await db.run(
            `INSERT INTO transactions (member_id, date, type, amount, remarks) 
                         VALUES (?, ?, 'penalty', ?, ?)`,
            [
              member.id,
              todayStr,
              penaltyAmount,
              `Late payment penalty for ${targetMonth}`,
            ],
          );

          await logAudit(null, "ASSESS_LATE_PENALTY", {
            member_id: member.id,
            month: targetMonth,
            amount: penaltyAmount,
          });

          console.log(
            `[Penalty] Assessed penalty of ₹${penaltyAmount} to ${member.name} for ${targetMonth}`,
          );
          assessedCount++;
        }
      }
    }

    return assessedCount;
  } catch (err) {
    console.error("[Penalty] Error assessing late penalties:", err);
    return 0;
  }
};

const initPenaltySchedule = () => {
  // Run daily at midnight to check if today is the grace day
  cron.schedule("0 0 * * *", async () => {
    try {
      const graceDaySetting = await db.get(
        "SELECT value FROM settings WHERE key = 'penalty_grace_day'",
      );
      const graceDay = graceDaySetting ? parseInt(graceDaySetting.value) : 10;

      const today = new Date().getDate();
      if (today === graceDay) {
        console.log(
          `[Penalty] Grace day (${graceDay}) reached. Running late penalty check...`,
        );
        const currentMonth = new Date().toISOString().slice(0, 7);
        const count = await assessLatePenalties(currentMonth);
        console.log(
          `[Penalty] Automated check complete. Assessed penalties for ${count} members.`,
        );
      }
    } catch (err) {
      console.error("[Penalty] Scheduler Error:", err);
    }
  });

  console.log("[Penalty] Automated Late Penalty Check scheduler initialized");
};

module.exports = {
  assessLatePenalties,
  initPenaltySchedule,
};
