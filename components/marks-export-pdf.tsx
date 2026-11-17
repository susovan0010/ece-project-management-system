'use client';

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { SemesterMarksExportData } from '@/app/actions/tracker';

export type MarksExportFormat = 'EXISTING' | 'SCALE_100' | 'SCALE_60_40';

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1e3a8a',
    paddingBottom: 8,
  },
  instTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a8a',
    textAlign: 'center',
  },
  deptTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
    textAlign: 'center',
    marginTop: 2,
  },
  subTitle: {
    fontSize: 8.5,
    color: '#475569',
    textAlign: 'center',
    marginTop: 3,
  },
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#e2e8f0',
    minHeight: 18,
    alignItems: 'center',
  },
  headerRow: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    minHeight: 22,
  },
  altRow: {
    backgroundColor: '#f8fafc',
  },
  cell: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#cbd5e1',
  },
  cellLast: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  footer: {
    marginTop: 10,
    fontSize: 7.5,
    color: '#64748b',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

function SemesterMarksPdfDocument({
  data,
  format,
}: {
  data: SemesterMarksExportData;
  format: MarksExportFormat;
}) {
  const formatLabel =
    format === 'EXISTING'
      ? `Existing Format (Supervisor Rubric ${data.supRubricCode} /${data.supMax} + Examiner Rubric ${data.examRubricCode} /${data.examMax})`
      : format === 'SCALE_100'
      ? 'Scale of 100 (Combined Supervisor + Examiner)'
      : 'Scale of 60 / 40 (60% & 40% Split of Total out of 100)';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.instTitle}>HERITAGE INSTITUTE OF TECHNOLOGY, KOLKATA (HITK)</Text>
          <Text style={styles.deptTitle}>
            Department of Electronics &amp; Communication Engineering — Semester {data.semester} Evaluation Marks
          </Text>
          <Text style={styles.subTitle}>
            Batch: {data.batchId} | Format: {formatLabel} | Total Students: {data.rows.length}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            <Text style={[styles.cell, { width: '6%', textAlign: 'center' }]}>Grp</Text>
            <Text style={[styles.cell, { width: '24%' }]}>Student Name</Text>
            <Text style={[styles.cell, { width: '16%' }]}>College Roll</Text>
            <Text style={[styles.cell, { width: '18%' }]}>University Roll</Text>

            {format === 'EXISTING' && (
              <>
                <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>
                  Supervisor (/{data.supMax})
                </Text>
                <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>
                  Examiner (/{data.examMax})
                </Text>
                <Text style={[styles.cellLast, { width: '12%', textAlign: 'right' }]}>
                  Total (/{data.rawMax})
                </Text>
              </>
            )}

            {format === 'SCALE_100' && (
              <Text style={[styles.cellLast, { width: '36%', textAlign: 'right' }]}>
                Combined Total Marks (Out of 100)
              </Text>
            )}

            {format === 'SCALE_60_40' && (
              <>
                <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>Total (/100)</Text>
                <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>60% (/60)</Text>
                <Text style={[styles.cellLast, { width: '12%', textAlign: 'right' }]}>40% (/40)</Text>
              </>
            )}
          </View>

          {data.rows.map((r, idx) => (
            <View
              key={`${r.groupNumber}-${r.collegeRoll}-${idx}`}
              style={[styles.row, idx % 2 === 1 ? styles.altRow : {}]}
              wrap={false}
            >
              <Text style={[styles.cell, { width: '6%', textAlign: 'center' }]}>{r.groupNumber}</Text>
              <Text style={[styles.cell, { width: '24%' }]}>{r.studentName}</Text>
              <Text style={[styles.cell, { width: '16%' }]}>{r.collegeRoll}</Text>
              <Text style={[styles.cell, { width: '18%' }]}>{r.universityRoll}</Text>

              {format === 'EXISTING' && (
                <>
                  <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>
                    {r.supervisorMarks.toFixed(2)}
                  </Text>
                  <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>
                    {r.examinerMarks.toFixed(2)}
                  </Text>
                  <Text style={[styles.cellLast, { width: '12%', textAlign: 'right' }]}>
                    {r.rawTotal.toFixed(2)}
                  </Text>
                </>
              )}

              {format === 'SCALE_100' && (
                <Text style={[styles.cellLast, { width: '36%', textAlign: 'right' }]}>
                  {r.totalScale100.toFixed(2)}
                </Text>
              )}

              {format === 'SCALE_60_40' && (
                <>
                  <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>
                    {r.totalScale100.toFixed(2)}
                  </Text>
                  <Text style={[styles.cell, { width: '12%', textAlign: 'right' }]}>
                    {r.scale60.toFixed(2)}
                  </Text>
                  <Text style={[styles.cellLast, { width: '12%', textAlign: 'right' }]}>
                    {r.scale40.toFixed(2)}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Generated by HITK ECE Project Committee Administration</Text>
          <Text>Date: {new Date().toLocaleDateString('en-IN')}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateSemesterMarksPdfBlob(
  data: SemesterMarksExportData,
  format: MarksExportFormat
): Promise<Blob> {
  return await pdf(<SemesterMarksPdfDocument data={data} format={format} />).toBlob();
}
