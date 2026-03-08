const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a PDF receipt for a transaction
 * @param {Object} transaction - Transaction details
 * @param {Object} member - Member details
 * @param {string} fundName - Name of the fund
 * @returns {Promise<string>} - Path to the generated receipt
 */
async function generateReceipt(transaction, member, fundName) {
    return new Promise((resolve, reject) => {
        try {
            // Create receipts directory if it doesn't exist
            const receiptsDir = path.join(__dirname, '../uploads/receipts');
            if (!fs.existsSync(receiptsDir)) {
                fs.mkdirSync(receiptsDir, { recursive: true });
            }

            // Generate filename
            const filename = `receipt_${transaction.id}_${Date.now()}.pdf`;
            const filepath = path.join(receiptsDir, filename);
            const relativePath = `uploads/receipts/${filename}`;

            // Create PDF
            const doc = new PDFDocument({ size: 'A5', margin: 50 });
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Header with border
            doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke();

            // Title
            doc.fontSize(22).font('Helvetica-Bold').text(fundName || 'CHIT FUND', { align: 'center' });
            doc.fontSize(16).text('PAYMENT RECEIPT', { align: 'center' });
            doc.moveDown();

            // Receipt details box
            const boxTop = doc.y;
            doc.fontSize(10).font('Helvetica');
            doc.text(`Receipt No: TXN-${transaction.id}`, 60, boxTop);
            doc.text(`Date: ${new Date(transaction.date).toLocaleDateString()}`, 60, doc.y);
            doc.moveDown();

            // Divider
            doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).stroke();
            doc.moveDown();

            // Payment details
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('RECEIVED FROM:', 60, doc.y);
            doc.font('Helvetica').fontSize(14);
            doc.text(member.name, 60, doc.y);
            doc.fontSize(10);
            doc.text(`Contact: ${member.contact || 'N/A'}`, 60, doc.y);
            doc.text(`Member Type: ${member.type}`, 60, doc.y);
            doc.moveDown();

            // Amount box
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('AMOUNT:', 60, doc.y);
            doc.fontSize(20).fillColor('#2563eb');
            doc.text(`₹${transaction.amount.toFixed(2)}`, 60, doc.y);
            doc.fillColor('black');
            doc.moveDown();

            // Payment type
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('PAYMENT TYPE:', 60, doc.y);
            doc.font('Helvetica').fontSize(11);
            doc.text(transaction.type.toUpperCase(), 60, doc.y);
            doc.moveDown();

            // Remarks
            if (transaction.remarks) {
                doc.fontSize(12).font('Helvetica-Bold');
                doc.text('REMARKS:', 60, doc.y);
                doc.font('Helvetica').fontSize(10);
                doc.text(transaction.remarks, 60, doc.y, { width: doc.page.width - 120 });
                doc.moveDown();
            }

            // Footer
            doc.moveDown(2);
            doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).stroke();
            doc.moveDown(0.5);
            doc.fontSize(9).font('Helvetica');
            doc.text('This is a computer-generated receipt and does not require a signature.', { align: 'center' });
            doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

            // Authorized signature placeholder
            doc.moveDown(2);
            doc.text('_____________________', doc.page.width - 150, doc.y);
            doc.text('Authorized Signature', doc.page.width - 150, doc.y);

            doc.end();

            stream.on('finish', () => {
                resolve(relativePath);
            });

            stream.on('error', (err) => {
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateReceipt };
