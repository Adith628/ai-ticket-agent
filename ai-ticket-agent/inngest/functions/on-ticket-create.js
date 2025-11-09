import Ticket from "../../models/ticket.js";
import User from "../../models/user.js";
import analyzeTicket from "../../utils/ai.js";
import { sendMail } from "../../utils/mailer";
import { inngest } from "../client";

import { NonRetriableError } from "inngest";

export const onTicketCreated = inngest.createFunction(
  { id: "on-ticket-created", retries: 2 },
  { event: "ticket/created" },
  async ({ event, step }) => {
    try {
      const { ticketId } = event.data;

      // fetch ticket from DB
      const ticket = await step.run("fetch-ticket", async () => {
        const ticketObject = await Ticket.findById(ticketId);

        if (!ticket) {
          throw new NonRetriableError(
            "Ticket no longer exists in our Database"
          );
        }
        return ticketObject;
      });

      await step.run("update-ticket-status", async () => {
        await Ticket.findByIdAndUpdate(ticket._id, {
          status: "TODO",
        });
      });

      const aiResponse = await analyzeTicket(ticket);

      const relatedSkills = await step.run("ai-processing", async () => {
        let skills = [];
        if (aiResponse) {
          await Ticket.findByIdAndUpdate(ticket._id, {
            priority: ["low", "medium", "high"].includes(aiResponse.priority)
              ? aiResponse.priority
              : "medium",
            helpfulNotes: aiResponse.helpfulNotes || "",
            status: "IN_PROGRESS",
            relatedSkills: Array.isArray(aiResponse.relatedSkills),
          });
          skills = aiResponse.relatedSkills || [];
        }
        return skills;
      });

      const moderator = await step.run("assign-moderator", async () => {
        let user = await User.findOne({
          roles: "moderator",
          skills: {
            $elemMatch: {
              $regex: relatedSkills.join("|"),
              $options: "i",
            },
          },
        });
        if (!user) {
          user = await User.findOne({ roles: "admin" });
        }
        await Ticket.findByIdAndUpdate(ticket._id, {
          assignedTo: user?._id || null,
        });
        return user;
      });

      await step.run("send-notification-email", async () => {
        if (moderator) {
          await sendMail({
            to: moderator.email,
            subject: `New Ticket Assigned`,
            text: `A new ticket titled "${ticket.title}" has been assigned to you. Please review it at your earliest convenience.`,
          });
        }
      });

      return { success: true };
    } catch (err) {
      console.error("Error in onTicketCreated function:", err);
    }
  }
);
