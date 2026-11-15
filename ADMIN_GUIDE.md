# Growtick Academy — Admin Guide

How to run **academy.growtick.in**: event-day check-in, certificates, courses, online payments and settings.

Admin home: **https://academy.growtick.in/admin**

---

## 1. Signing in

1. Open **https://academy.growtick.in/admin**. You're taken to the sign-in page with the admin email filled in.
2. Enter the password and click **Sign in**. No email or code is involved.
3. Stay signed in on the check-in phone. Don't tap **Sign out** on event day.

Other admins: they create an account at **/login** (or you set a password for them in **Settings → Reset a learner's password**), then you use **Settings → Admins → Make admin**.

The admin menu has: **Overview · Registrations & check-in · UPI payments · Courses · Learners · Email log · Settings**.

---

## 2. Before an event (offline batch)

| Task | Where |
|---|---|
| Check the batch date, time, venue, fee and capacity | Courses → *course* → Batches |
| See who has registered | Registrations & check-in (pick the batch) |
| Import people from a Google Form | Registrations → **Import from CSV** |
| Download the list (for printing or backup) | Registrations → **Export CSV** |
| Set the certificate signatory name | Settings → *Certificate signatory name* |

### Importing a Google Form list
1. In Google Sheets (form responses) choose **File → Download → Comma-separated values (.csv)**.
2. Registrations & check-in → choose the batch → open **Import from CSV**.
3. Pick the file (or paste its contents). The header row must contain an **email** column. **Name** and **mobile/phone** columns are detected automatically.
4. Tick **Email each person their registration code** if you want them to get a confirmation.
5. Click **Import**. The message tells you how many were added and which rows were skipped (bad email, duplicate, already registered).

> Importing the same file twice is safe. People who are already registered are skipped.

---

## 3. Event day: check-in (phone friendly)

Open **Registrations & check-in** on your phone. The batch closest to today is selected automatically.

The top shows live counts: **Registered · Present · Paid (₹ total) · Certificates issued**.

For each person who arrives:
1. Type their **name, mobile or registration code** in the search box.
2. Tap **Present**.
3. When they pay, tap **₹49 received** (or whatever the fee is).

Made a mistake? Use **Undo present** / **Undo ₹**.

### Walk-ins (not registered)
Open **Add a walk-in**, enter their name, email and mobile. *Present now* and *₹ received* are ticked by default. Click **Add walk-in**. Walk-ins are allowed even if the batch is full.

### Cancelling
**Cancel** removes someone from the counts (seat freed). **Restore** brings them back.

---

## 4. Certificates

### Offline batches
- After the session, click **Issue certificates to all present (N)** at the top of the registrations page. Every checked-in person who doesn't have a certificate yet gets a PDF generated and emailed.
- Or issue one by one with **Issue certificate** on a person (only available after they're marked present).
- **PDF** opens the certificate. **Resend** emails it again.

### Online courses
- Issued **automatically** when the learner completes every required lesson, passes the quiz and attends the live class (if the course has one).
- In **Learners** you can see progress and use **Issue manually** to override (for example, if they attended live but the system didn't record it).

### Verifying
Anyone can check a certificate at **/verify** using the verification code (`GT-VRF-…`) or the serial (`GT-GST-2026-0001`).

> The name printed is the name on the registration. Fix typos **before** issuing. A certificate can't be edited after it is issued.

---

## 5. Online payments (UPI)

1. A learner enrols in a paid online course, pays to the UPI ID/QR shown, and submits the **12-digit UPI reference (UTR)**.
2. You get them in **UPI payments → Waiting**, with name, amount and UTR.
3. Check the UTR and amount against your bank / UPI business app statement.
4. Click **Approve**. The course unlocks and the learner is emailed.
   Or type a reason and click **Reject**. The learner is emailed and can submit again.

> Each UTR can only be used once, so the same payment can't unlock two enrolments.

Check this page at least twice a day. Learners are waiting on you.

---

## 6. Creating and editing courses

**Courses → New course**: title, URL slug (e.g. `tally-prime-basics`, can't be changed later), delivery (*Offline*, *Online*, *Offline + online*), online price (0 = free), certificate type, quiz pass mark. New courses start as **Draft** (hidden from the public).

On the course page (**Edit**):

### Course details
Title, subtitle, description, outcomes and highlights (one per line), cover image (upload), status. Set **Status → Published** to show it on the site.

### Batches
- **Offline (venue)**: date/time (enter in IST), venue, address, Google Maps link, capacity (0 = unlimited), fee, *pay on the spot*.
- **Live online class**: date/time and **meeting link** (Google Meet / Zoom). Learners see a **Join** button 15 minutes before the start. The link is never shown earlier. Joining records their attendance. Use **Send reminder email** on the registrations page (for that batch) a day before.
- Status: **open** (taking registrations) · **full** · **closed** · **done**. A batch with registrations can't be deleted; set it to *closed* instead.

### Curriculum (online learning)
1. **Add module** (e.g. "Module 1: GST basics").
2. Inside a module, **+ Add lesson** and choose a type:
   - **Video**: paste a YouTube link (upload videos to YouTube as *Unlisted*).
   - **Reading**: write the notes in the text box (a blank line starts a new paragraph).
   - **Download**: save the lesson, then **Attach file** (PDF, PPT, Excel… up to 50 MB). Files are private; only enrolled learners can download them.
   - **Quiz**: save the lesson, then add questions. Put the options one per line and give the number of the correct option (1, 2, 3…). Answers are checked on the server and never shown to learners.
   - **Live class**: links the learner to the course's live batches.
3. Options per lesson: **Required for certificate** (untick for optional extras) and **Free preview** (viewable before paying).
4. Use **↑ / ↓** to reorder modules, lessons and questions.

---

## 7. Learners, emails and settings

- **Learners**: every online enrolment with progress %, best quiz score, live attendance (**Mark attended** if someone attended but joined another way) and certificate actions. **Export CSV** for reports.
- **Email log**: every email the site sent (registrations, certificates, payments, reminders), with status. A *failed* row shows the error; use *Resend* on the person if needed.
- **Settings**:
  - *Reset a learner's password*: for "I forgot my password" messages. Type their email and a new password, then tell them the password.
  - *Admins*: make or remove admins.
  - *Certificate signatory name*: printed on every new certificate.
  - *UPI ID*, *payee name* and **Upload UPI QR image**: shown on the payment page. **Set these before selling any paid online course.**
  - Contact phone / WhatsApp / Instagram links.

---

## 8. Quick troubleshooting

| Problem | What to do |
|---|---|
| Someone says they didn't get the confirmation | Search them in Registrations. Their code is shown there. Check **Email log** for a failed send. |
| "Already registered" for a walk-in | They're in the list already. Search by email/mobile and tap **Present**. |
| Wrong name on a registration | Ask the site owner to correct it in the database **before** issuing the certificate. |
| Certificate not received | Registrations → **Resend**, or send them the **PDF** link directly. |
| Learner paid but course still locked | UPI payments → find them → **Approve**. |
| Online learner finished but no certificate | Learners → check what's missing in the progress column → **Issue manually** if appropriate. |
| Learner forgot their password | Settings → **Reset a learner's password**, then send them the new one. |
| Batch shows the wrong time | Times are entered and shown in IST. Edit the batch under Courses. |

Learner-facing help (share with students): **https://academy.growtick.in/help**
