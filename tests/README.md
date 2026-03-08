# Chit Fund Management System - Test Suite

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with verbose output
```bash
npm run test:verbose
```

## Test Coverage

The test suite covers the following features:

### 1. EMI Schedule Generator
- ✅ EMI schedule generation for loans
- ✅ Payment status detection (paid/pending/overdue/partial)
- ✅ Correct date calculation for due dates
- ✅ Integration with repayment data

### 2. Payment Status Dashboard
- ✅ Payment grid generation for last 6 months
- ✅ Member payment status tracking
- ✅ Paid vs pending identification

### 3. Interest Tracking
- ✅ Total interest calculation (Simple Interest formula)
- ✅ Interest collected from repayments
- ✅ Pending interest calculation
- ✅ Edge cases (no interest collected)

### 4. Duplicate Payment Prevention
- ✅ Duplicate detection for same month
- ✅ Allow payments for different months
- ✅ Batch ID validation

### 5. PDF Passbook Generation
- ✅ PDF document creation with headers
- ✅ Running balance calculation
- ✅ Transaction table formatting
- ✅ Member details inclusion

### 6. Contribution Receipt Generation
- ✅ Receipt PDF creation with transaction details
- ✅ Unique filename generation
- ✅ Directory creation if not exists
- ✅ Relative path storage for database
- ✅ Integration with payment flow
- ✅ Error handling (payment continues if receipt fails)

## Test Structure

```
tests/
├── features.test.js          # EMI, Payment Status, Interest, Duplicates
└── pdf-generation.test.js    # PDF Passbook & Receipts
```

## Coverage Goals

- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 50%
- **Statements**: 50%

## Mocked Dependencies

The tests use Jest mocks for:
- Database (`../config/database`)
- PDFKit (`pdfkit`)
- File System (`fs`)

This ensures tests run quickly without external dependencies.

## Adding New Tests

1. Create test file in `tests/` directory
2. Name it `*.test.js`
3. Import required modules
4. Write test cases using Jest syntax
5. Run `npm test` to verify

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm test
```

## Notes

- Tests are isolated and don't affect the production database
- All external dependencies are mocked
- Tests run in Node.js environment
- Coverage reports are generated in `coverage/` directory
