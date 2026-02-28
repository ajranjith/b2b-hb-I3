import ExcelJS from 'exceljs';
import { join } from 'path';

async function updateOrderStatusTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Order Status');

  // Define columns
  worksheet.columns = [
    { header: 'Your Order No', key: 'yourOrderNo', width: 20 },
    { header: 'Our Order No', key: 'ourOrderNo', width: 20 },
    { header: 'Status', key: 'status', width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Add example rows with new status codes
  const exampleData = [
    { yourOrderNo: 'HB260112345', ourOrderNo: 'K8-001', status: 'PUR' },
    { yourOrderNo: 'HB260112346', ourOrderNo: 'K8-002', status: 'SBO' },
    { yourOrderNo: 'HB260112347', ourOrderNo: 'K8-003', status: 'PIQ' },
    { yourOrderNo: 'HB260112348', ourOrderNo: 'K8-004', status: 'PIK' },
    { yourOrderNo: 'HB260112349', ourOrderNo: 'K8-005', status: 'ADV' },
    { yourOrderNo: 'HB260112350', ourOrderNo: 'K8-006', status: 'WDL' },
    { yourOrderNo: 'HB260112351', ourOrderNo: 'K8-007', status: 'PRO' },
    { yourOrderNo: 'HB260112352', ourOrderNo: 'K8-008', status: 'PROCESSING' },
    { yourOrderNo: 'HB260112353', ourOrderNo: 'K8-009', status: 'BACKORDER' },
    { yourOrderNo: 'HB260112354', ourOrderNo: 'K8-010', status: 'READY FOR SHIPMENT' },
  ];

  exampleData.forEach((row) => {
    worksheet.addRow(row);
  });

  // Add a notes section
  worksheet.addRow({});
  worksheet.addRow({});

  const notesStartRow = worksheet.rowCount + 1;
  worksheet.mergeCells(`A${notesStartRow}:C${notesStartRow}`);
  const notesHeaderCell = worksheet.getCell(`A${notesStartRow}`);
  notesHeaderCell.value = 'Status Code Reference';
  notesHeaderCell.font = { bold: true, size: 12 };
  notesHeaderCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E6E6' },
  };

  const statusReference = [
    ['Status Code', 'Description'],
    ['PUR / SBO', 'Back Order'],
    ['PIQ / PIK', 'Picking'],
    ['ADV', 'Packing'],
    ['WDL', 'Out for Delivery'],
    ['PRO', 'Processing'],
    ['PROCESSING', 'Processing (full name)'],
    ['BACKORDER', 'Back Order (full name)'],
    ['READY FOR SHIPMENT', 'Ready for Shipment'],
    ['CANCELLED', 'Cancelled'],
    ['FULLFILLED', 'Fulfilled'],
  ];

  statusReference.forEach((row, index) => {
    const rowNum = notesStartRow + 1 + index;
    worksheet.getCell(`A${rowNum}`).value = row[0];
    worksheet.getCell(`B${rowNum}`).value = row[1];

    if (index === 0) {
      // Header row for reference table
      worksheet.getRow(rowNum).font = { bold: true };
      worksheet.getRow(rowNum).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
    }
  });

  // Save the file
  const templatePath = join(
    process.cwd(),
    'src',
    'templates',
    'excel',
    'OverallStatus_Model_Template.xlsx'
  );

  await workbook.xlsx.writeFile(templatePath);
  console.log(`✓ Updated template saved to: ${templatePath}`);
}

// Run the script
updateOrderStatusTemplate()
  .then(() => {
    console.log('✓ Order Status template updated successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error updating template:', error);
    process.exit(1);
  });
