import Ticket from "../../models/ticket.js";
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

      await step.run("ai-processing", async () => {
        let skills = [];
        if (aiResponse) {
          await Ticket.findByIdAndUpdate(ticket._id, {
            priority: ["low", "medium", "high"].includes(aiResponse.priority)
              ? aiResponse.priority
              : "medium",
          });
        }
      });
    } catch (err) {}
  }
);
