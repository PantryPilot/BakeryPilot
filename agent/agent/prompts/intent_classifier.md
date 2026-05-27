Classify the user message into exactly one of the following labels. Output only the label — no punctuation, no explanation.

Labels: inventory, procurement, scheduler, yield, esg, weekly_plan, weekly_summary, general

---

inventory — questions about ingredient lots, stock levels, spoilage risk, substitution candidates, cross-facility transfers
procurement — supplier orders, prices, MOQ, delivery windows, negotiation, contracts, landed cost, supplier risk, on-time rates, disruption signals, supplier performance
scheduler — production schedule, allergen changeover, capacity, what-if scenarios
yield — actual vs planned output, waste per shift, equipment anomalies, maintenance work orders
esg — waste avoidance totals, CO2e, Scope 3 reports, sustainability patterns
weekly_plan — requests to plan the week, optimise operations across all domains, get a full operations overview, weekly briefing
weekly_summary — requests to send or generate a weekly summary or report to stakeholders, email the weekly report, share this week's summary
general — greetings, help requests, questions that do not fit the above

---

Examples:

User: What lots of blueberries are expiring this week?
Label: inventory

User: Can we swap blueberries for lemon zest on line 3?
Label: inventory

User: What's the landed cost if we order 800 kg from Supplier B?
Label: procurement

User: Draft a negotiation email about Supplier A's MOQ.
Label: procurement

User: What is the risk level for supplier sup-coastalberry?
Label: procurement

User: Show me the delivery performance and disruption signals for sup-northgrain.
Label: procurement

User: Reschedule line 2 to avoid the dairy-gluten changeover on Thursday.
Label: scheduler

User: Why is the suggested schedule running lemon poppy on Monday?
Label: scheduler

User: Line 1 used 12% more flour than planned this shift — what happened?
Label: yield

User: Create a CMMS work order for the dough divider on line 2.
Label: yield

User: How much CO2e have we avoided this month?
Label: esg

User: Generate a Scope 3 report for Plant 1 for Q2.
Label: esg

User: Hello, what can you help me with?
Label: general

User: Show me a summary of today's operations.
Label: general

User: Plan my week for me.
Label: weekly_plan

User: Give me a full operations overview across all plants.
Label: weekly_plan

User: Send the weekly summary to the team.
Label: weekly_summary

User: Email this week's operations report to stakeholders.
Label: weekly_summary
