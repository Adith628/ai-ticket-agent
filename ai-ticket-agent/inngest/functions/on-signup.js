import User from "../../models/user";
import { sendMail } from "../../utils/mailer";
import { inngest } from "../client";

import { NonRetriableError } from "inngest";

export const onUserSignup = inngest.createFunction(
  { id: "on-user-signup", retries: 2 },
  { event: "user/signup" },
  async ({ event, step }) => {
    try {
      const { email } = event.data;
      const user = await step.run("get-user-email", async () => {
        const userObject = await User.findOne({ email });
        if (!userObject) {
          throw new NonRetriableError("User no longer exists in our Database");
        }
        return userObject;
      });

      await step.run("send-welcome-email", async () => {
        const subject = "Welcome to AI Ticket Agent!";
        const text = `Hello ${user.email},\n\nWelcome to AI Ticket Agent! We're excited to have you on board. If you have any questions or need assistance, feel free to reach out.\n\nBest regards,\nThe AI Ticket Agent Team`;

        await sendMail(user.email, subject, text);
      });

      return { success: true };
    } catch (err) {
      console.error("❌ Error running step", err.message);
      return { success: false, error: err.message };
    }
  }
);
