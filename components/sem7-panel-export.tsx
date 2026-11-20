'use client';

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import type { PanelGenerationResult } from '@/lib/engine/panel-generator';

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 34,
    paddingHorizontal: 24,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1985A1',
    paddingBottom: 8,
  },
  instTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    textAlign: 'center',
  },
  deptTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1985A1',
    textAlign: 'center',
    marginTop: 2,
  },
  subTitle: {
    fontSize: 8,
    color: '#475569',
    textAlign: 'center',
    marginTop: 3,
  },
  panelBlock: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
  },
  panelHeader: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelHeaderTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  panelHeaderMeta: {
    fontSize: 8,
    color: '#e2e8f0',
  },
  membersBox: {
    backgroundColor: '#f8fafc',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: '#cbd5e1',
  },
  membersLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    marginBottom: 2,
  },
  membersText: {
    fontSize: 8,
    color: '#0f172a',
    lineHeight: 1.35,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 0.75,
    borderBottomColor: '#cbd5e1',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    fontSize: 7.5,
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
  },
  cellLast: {
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  colGrp: { width: '10%' },
  colCode: { width: '14%' },
  colTitle: { width: '34%' },
  colSup: { width: '18%' },
  colStudents: { width: '24%' },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#64748b',
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 4,
  },
});

function Sem7PanelsPdfDocument({
  result,
  batchId,
}: {
  result: PanelGenerationResult;
  batchId: string;
}) {
  const generatedOn = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Document title={`ECE 7th Sem Evaluation Panels - ${batchId}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.instTitle}>HERITAGE INSTITUTE OF TECHNOLOGY, KOLKATA</Text>
          <Text style={styles.deptTitle}>
            Department of Electronics &amp; Communication Engineering
          </Text>
          <Text style={styles.subTitle}>
            7th Semester Project Evaluation Panels &bull; Batch {batchId} &bull; {result.panelCount} Panels, {result.totalGroups} Groups &bull; Generated on {generatedOn}
          </Text>
        </View>

        {result.panels.map((panel) => (
          <View key={panel.panelNumber} style={styles.panelBlock} wrap={false}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelHeaderTitle}>
                Panel {panel.panelNumber}
                {panel.roomNumber ? `  |  Room: ${panel.roomNumber}` : ''}
              </Text>
              <Text style={styles.panelHeaderMeta}>
                {panel.members.length} Evaluators &bull; {panel.groups.length} Groups &bull; {panel.coveredDomainsCount} Domains
              </Text>
            </View>

            <View style={styles.membersBox}>
              <Text style={styles.membersLabel}>PANEL MEMBERS (EVALUATORS)</Text>
              <Text style={styles.membersText}>
                {panel.members.map((m) => m.name).join(', ')}
              </Text>
            </View>

            <View style={styles.tableHeader}>
              <View style={[styles.cell, styles.colGrp]}>
                <Text>Group</Text>
              </View>
              <View style={[styles.cell, styles.colCode]}>
                <Text>Topic Code</Text>
              </View>
              <View style={[styles.cell, styles.colTitle]}>
                <Text>Project Title</Text>
              </View>
              <View style={[styles.cell, styles.colSup]}>
                <Text>Supervisor</Text>
              </View>
              <View style={[styles.cellLast, styles.colStudents]}>
                <Text>Student Members</Text>
              </View>
            </View>

            {panel.groups.map((g) => (
              <View key={g.id} style={styles.row}>
                <View style={[styles.cell, styles.colGrp]}>
                  <Text>Group {g.number}</Text>
                </View>
                <View style={[styles.cell, styles.colCode]}>
                  <Text>{g.topicCode}</Text>
                </View>
                <View style={[styles.cell, styles.colTitle]}>
                  <Text>{g.topicTitle}</Text>
                </View>
                <View style={[styles.cell, styles.colSup]}>
                  <Text>{g.supervisorName}</Text>
                </View>
                <View style={[styles.cellLast, styles.colStudents]}>
                  <Text>{g.studentNames.join(', ')}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>ECE Capstone Project Management System &bull; HITK</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadSem7PanelsPdf(
  result: PanelGenerationResult,
  batchId: string
): Promise<void> {
  const blob = await pdf(<Sem7PanelsPdfDocument result={result} batchId={batchId} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ECE_Sem7_Panels_${batchId}_${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadSem7PanelsExcel(
  result: PanelGenerationResult,
  batchId: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ECE Project Committee Portal';
  workbook.created = new Date();

  // Sheet 1: Summary per Panel (Panel Number, Room Number, Panel Members, Assigned Groups)
  const summarySheet = workbook.addWorksheet('Panel Summary');
  summarySheet.columns = [
    { header: 'Panel Number', key: 'panelNumber', width: 15 },
    { header: 'Room Number', key: 'roomNumber', width: 18 },
    { header: 'Panel Members', key: 'members', width: 48 },
    { header: 'Assigned Groups', key: 'groups', width: 32 },
    { header: 'Total Groups', key: 'groupCount', width: 14 },
    { header: 'Domains Covered', key: 'domainsCount', width: 16 },
  ];

  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };

  for (const panel of result.panels) {
    summarySheet.addRow({
      panelNumber: panel.panelNumber,
      roomNumber: panel.roomNumber || 'N/A',
      members: panel.members.map((m) => m.name).join(', '),
      groups: panel.groups.map((g) => `Group ${g.number} (${g.topicCode})`).join(', '),
      groupCount: panel.groups.length,
      domainsCount: panel.coveredDomainsCount,
    });
  }

  // Sheet 2: Detailed Group-wise Schedule
  const detailSheet = workbook.addWorksheet('Detailed Group Schedule');
  detailSheet.columns = [
    { header: 'Panel Number', key: 'panelNumber', width: 14 },
    { header: 'Room Number', key: 'roomNumber', width: 16 },
    { header: 'Panel Members', key: 'members', width: 42 },
    { header: 'Group', key: 'group', width: 12 },
    { header: 'Topic Code', key: 'topicCode', width: 16 },
    { header: 'Project Title', key: 'topicTitle', width: 40 },
    { header: 'Supervisor', key: 'supervisor', width: 24 },
    { header: 'Student Members', key: 'students', width: 42 },
  ];

  detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  detailSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1985A1' },
  };

  for (const panel of result.panels) {
    const memberNames = panel.members.map((m) => m.name).join(', ');
    for (const g of panel.groups) {
      detailSheet.addRow({
        panelNumber: panel.panelNumber,
        roomNumber: panel.roomNumber || 'N/A',
        members: memberNames,
        group: `Group ${g.number}`,
        topicCode: g.topicCode,
        topicTitle: g.topicTitle,
        supervisor: g.supervisorName,
        students: g.studentNames.join(', '),
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ECE_Sem7_Panels_${batchId}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
