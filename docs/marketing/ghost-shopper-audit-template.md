# BuildMyBot.App // Ghost Shopper Audit Template

This is not a passive tracking sheet. It is a Lethality Index. It documents the failure of your prospects so you can present them with irrefutable evidence of lost revenue.

Copy the table below into Excel or Google Sheets, or import the CSV at `public/marketing/ghost-shopper-audit-template.csv`.

## The BuildMyBot.App Audit Log

| Date/Time | Business Name | URL | Audit Method | Response Time | Delay (The Pain) | Est. Deal Value | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1/12/26 9:00 AM | Smith Family Law | smithlaw.com | Web Form | 1/12/26 1:30 PM | 4.5 Hours | $2,500 | Pitch Sent |
| 1/12/26 9:15 AM | Apex Roofing | apexroof.com | Chat Widget | No Reply | LOST LEAD | $8,000 | Call Scheduled |
| 1/12/26 9:30 AM | Elite MedSpa | elitespa.com | Phone Call | Voicemail | LOST LEAD | $450 | Pending |

### Export to Sheets
- Create a new sheet and paste the table above, or import the CSV file.
- Apply the formula in Column F to calculate the delay automatically.

## Column Key and Formula Logic

- **Column A (Date/Time):** When you sent the test message. Precision matters.
- **Column D (Audit Method):** What did you test? (Contact Form, Existing Chatbot, Phone, Email).
- **Column E (Response Time):** Record exactly when they replied. If they have not replied by end of day, mark "No Reply."
- **Column F (The Pain):** This is your weapon.
  - Excel formula: `=IF(E2="No Reply", "LOST LEAD", E2-A2)`
  - Sales context: "Mr. Smith, I contacted you at 9 AM. You replied at 1:30 PM. In that 4.5-hour gap, you likely lost the client to the firm that picked up the phone."
- **Column G (Est. Deal Value):** Know their numbers before you call.
  - Lawyer: $2,500+
  - HVAC: $500 - $10,000
  - Dentist: $200 - $5,000
  - Sales context: "You missed a $2,500 opportunity this morning. I have the timestamp."

## Tactical Instructions: How to Execute

### 1. The 10-Touch Morning Routine
Before 10:00 AM, identify 10 businesses in a specific vertical (e.g., Personal Injury Attorneys in Austin, TX).

- Fill out Columns A, B, C, and G.
- Execute the audit (Column D). Send a simple, realistic inquiry:
  - "Hi, do you offer free consultations for new cases?"
  - "I need a quote for a roof repair."

### 2. The Waiting Game
Wait. Do not call them immediately.

- Let the timer run.
- The longer they take to reply, the stronger your sales position becomes.

### 3. The Strike
Once the delay passes 30 minutes, you have a valid sales angle.

Once the delay passes 2 hours, you have a statistical guarantee they lost the lead.

### 4. The Pitch (Using the Sheet)
When you call or email, reference the specific data in Column F:

"I'm looking at my log here. I reached out to your firm 3 hours ago. I still haven't heard back. If I was a real client worth $2,500 (Column G), that money is gone. I can install a bot that replies in 4 seconds. Want to see it?"

## Next Step
Would you like a drafted email template specifically designed to send to prospects who scored "No Reply" or "LOST LEAD" on this audit sheet?
