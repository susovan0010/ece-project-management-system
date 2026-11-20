'use client';

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { DomainExpertsOverviewData } from '@/app/actions/domain-experts';

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 26,
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
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  kpiLabel: {
    fontSize: 7,
    color: '#64748b',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 6,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#1985A1',
    paddingLeft: 6,
  },
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#e2e8f0',
    minHeight: 20,
    alignItems: 'stretch',
  },
  headerRow: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    minHeight: 22,
  },
  altRow: {
    backgroundColor: '#f8fafc',
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRightWidth: 0.75,
    borderRightColor: '#e2e8f0',
    justifyContent: 'center',
  },
  cellLast: {
    paddingVertical: 4,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  colNum: { width: '5%', textAlign: 'center' },
  colName: { width: '25%' },
  colRole: { width: '13%', textAlign: 'center' },
  colGroups: { width: '9%', textAlign: 'center' },
  colDomains: { width: '48%' },
  nameText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: '#0f172a',
  },
  emailText: {
    fontSize: 7,
    color: '#64748b',
    marginTop: 1,
  },
  domainText: {
    fontSize: 8,
    color: '#1e293b',
    lineHeight: 1.35,
  },
  emptyDomainText: {
    fontSize: 7.5,
    color: '#94a3b8',
    fontFamily: 'Helvetica-Oblique',
  },
  catHeader: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: '#bae6fd',
  },
  catTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#0369a1',
  },
  colDomName: { width: '38%' },
  colDomExperts: { width: '62%' },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 26,
    right: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#64748b',
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 4,
  },
});

function DomainExpertsPdfDocument({ data }: { data: DomainExpertsOverviewData }) {
  const generatedOn = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const sortedFaculty = [...data.facultyList].sort((a, b) => a.name.localeCompare(b.name));
  const coveredDomainsCount = data.categories.reduce(
    (acc, cat) => acc + cat.domains.filter((d) => d.expertCount > 0).length,
    0
  );
  const totalDomainsCount = data.categories.reduce((acc, cat) => acc + cat.domains.length, 0);
  const mappedFacultyCount = sortedFaculty.filter((f) => f.domainExpertise.length > 0).length;

  return (
    <Document title="ECE Faculty Domain Experts Directory">
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.instTitle}>HERITAGE INSTITUTE OF TECHNOLOGY, KOLKATA</Text>
          <Text style={styles.deptTitle}>
            Department of Electronics &amp; Communication Engineering
          </Text>
          <Text style={styles.subTitle}>
            Faculty Supervisors &amp; Domain Expertise Mapping Report &bull; Generated on {generatedOn}
          </Text>
        </View>

        {/* Summary KPI Strip */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{sortedFaculty.length}</Text>
            <Text style={styles.kpiLabel}>Total Faculty &amp; Admins</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{mappedFacultyCount}</Text>
            <Text style={styles.kpiLabel}>Supervisors with Domains</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>
              {coveredDomainsCount} / {totalDomainsCount}
            </Text>
            <Text style={styles.kpiLabel}>ECE Domains Covered</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{totalDomainsCount - coveredDomainsCount}</Text>
            <Text style={styles.kpiLabel}>Uncovered Domains</Text>
          </View>
        </View>

        {/* Section 1: Supervisor-wise Domain Expertise */}
        <Text style={styles.sectionTitle}>1. Supervisor-Wise Domain Expertise Directory</Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            <View style={[styles.cell, styles.colNum]}>
              <Text>#</Text>
            </View>
            <View style={[styles.cell, styles.colName]}>
              <Text>Supervisor / Faculty</Text>
            </View>
            <View style={[styles.cell, styles.colRole]}>
              <Text>Role</Text>
            </View>
            <View style={[styles.cell, styles.colGroups]}>
              <Text>Groups</Text>
            </View>
            <View style={[styles.cellLast, styles.colDomains]}>
              <Text>Specialized ECE Domains</Text>
            </View>
          </View>

          {sortedFaculty.map((f, idx) => (
            <View
              key={f.id}
              style={[styles.row, idx % 2 === 1 ? styles.altRow : {}]}
              wrap={false}
            >
              <View style={[styles.cell, styles.colNum]}>
                <Text>{idx + 1}</Text>
              </View>
              <View style={[styles.cell, styles.colName]}>
                <Text style={styles.nameText}>{f.name}</Text>
                <Text style={styles.emailText}>{f.email}</Text>
              </View>
              <View style={[styles.cell, styles.colRole]}>
                <Text>{f.role === 'ADMIN' ? 'Admin' : 'Supervisor'}</Text>
              </View>
              <View style={[styles.cell, styles.colGroups]}>
                <Text>{f.allottedGroupsCount}</Text>
              </View>
              <View style={[styles.cellLast, styles.colDomains]}>
                {f.domainExpertise.length > 0 ? (
                  <Text style={styles.domainText}>
                    {f.domainExpertise.map((d) => `• ${d}`).join('   ')}
                  </Text>
                ) : (
                  <Text style={styles.emptyDomainText}>No domains mapped yet</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Section 2: Domain-wise Coverage by Category */}
        <Text style={styles.sectionTitle}>2. Domain-Wise Faculty Coverage (By Category)</Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            <View style={[styles.cell, styles.colDomName]}>
              <Text>ECE Research / Project Domain</Text>
            </View>
            <View style={[styles.cellLast, styles.colDomExperts]}>
              <Text>Mapped Supervisors / Experts</Text>
            </View>
          </View>

          {data.categories.map((cat) => (
            <View key={cat.id}>
              <View style={styles.catHeader}>
                <Text style={styles.catTitle}>{cat.name}</Text>
              </View>
              {cat.domains.map((dom, idx) => (
                <View
                  key={dom.domain}
                  style={[styles.row, idx % 2 === 1 ? styles.altRow : {}]}
                  wrap={false}
                >
                  <View style={[styles.cell, styles.colDomName]}>
                    <Text style={styles.nameText}>{dom.domain}</Text>
                  </View>
                  <View style={[styles.cellLast, styles.colDomExperts]}>
                    {dom.experts.length > 0 ? (
                      <Text style={styles.domainText}>
                        {dom.experts.map((fac) => fac.name).join(', ')}
                      </Text>
                    ) : (
                      <Text style={styles.emptyDomainText}>Uncovered (No supervisor mapped)</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>ECE Capstone Project Management System • HITK</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadDomainExpertsPdf(data: DomainExpertsOverviewData): Promise<void> {
  const blob = await pdf(<DomainExpertsPdfDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ECE_Supervisors_Domain_Expertise_${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
