# 🗄️ Database Schema Documentation

The ChitFund application uses **SQLite** for data storage. The schema is designed for relational integrity between members, their loans, and the history of transactions.

---

## Tables

### 1. `members`
Stores information about all fund participants.
- `id`: Primary Key (Auto-increment).
- `name`: Full name of the member.
- `contact`: Phone number or contact info.
- `type`: Either `member` (core group) or `public` (loan-only contributors).
- `status`: `active` or `inactive`.
- `created_at`: Timestamp of enrollment.

### 2. `loans`
Tracks all active and historical loans.
- `id`: Primary Key.
- `member_id`: Foreign Key linking to `members.id`.
- `amount`: Principal amount issued.
- `interest_rate`: Monthly flat rate (in %).
- `tenure`: Period in months.
- `emi`: Monthly payment amount (calculated).
- `start_date`: Date loan starts.
- `status`: `active` or `closed`.
- `outstanding`: Current remaining principal/balance.

### 3. `transactions`
The central ledger for all money movement.
- `id`: Primary Key.
- `member_id`: Foreign Key linking to `members.id` (can be NULL for generic expenses).
- `date`: Date of transaction.
- `type`: 
    - `contribution`: Monthly fund deposit.
    - `repayment`: Loan/EMI payment.
    - `disbursement`: Upfront loan payment to member.
    - `penalty`: Additional fees.
    - `expense`: Fund withdrawals for operations.
    - `opening_balance`: Initial fund setup.
- `amount`: Positive numerical value.
- `remarks`: Description (used by internal logic to link EMI payments to Loans).
- `receipt_path`: Path to uploaded document/image in `public/uploads/`.

### 4. `users`
System accounts for authentication.
- `id`: Primary Key.
- `username`: Unique username for login.
- `password_hash`: Bcrypt hashed password.
- `role`: `admin` (full access) or `manager` (restricted).

### 5. `settings`
Key-value store for application config.
- `key`: Unique config key (e.g., `opening_balance_set`).
- `value`: Config value.

---

## 🛠️ Migrations
The schema is managed in `database.js` using `CREATE TABLE IF NOT EXISTS` statements. The application automatically handles basic migrations, such as adding the `receipt_path` column to the `transactions` table.
