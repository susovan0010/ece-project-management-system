'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ECE_DOMAIN_CATEGORIES, ALL_ECE_DOMAINS } from '@/lib/constants/domains';

export interface DomainExpertFacultyItem {
  id: string;
  name: string;
  email: string;
  role: 'FACULTY' | 'ADMIN';
  domainExpertise: string[];
  mustChangePassword: boolean;
  proposedTopicsCount: number;
  allottedGroupsCount: number;
}

export interface DomainMappingItem {
  domain: string;
  categoryId: string;
  categoryName: string;
  experts: DomainExpertFacultyItem[];
  expertCount: number;
}

export interface DomainCategoryMapping {
  id: string;
  name: string;
  description: string;
  color: {
    bg: string;
    border: string;
    text: string;
    badge: string;
  };
  domains: DomainMappingItem[];
  totalExpertsInCat: number;
  coveredDomainsCount: number;
}

export interface DomainExpertsOverviewData {
  facultyList: DomainExpertFacultyItem[];
  categories: DomainCategoryMapping[];
  stats: {
    totalFaculty: number;
    completedProfiles: number;
    pendingProfiles: number;
    coveredDomainsCount: number;
    totalCatalogueDomains: number;
    topDomains: { domain: string; count: number }[];
  };
}

export async function getDomainExpertsMappingAction(): Promise<
  { success: true; data: DomainExpertsOverviewData } | { success: false; error: string }
> {
  const session = await auth();

  // Rule 1: Strict server-side ADMIN role guard
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Admins can view domain expert mappings.',
    };
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        role: { in: ['FACULTY', 'ADMIN'] },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        domainExpertise: true,
        mustChangePassword: true,
        _count: {
          select: {
            topics: true,
            groups: true,
          },
        },
      },
    });

    const facultyList: DomainExpertFacultyItem[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as 'FACULTY' | 'ADMIN',
      domainExpertise: u.domainExpertise || [],
      mustChangePassword: u.mustChangePassword,
      proposedTopicsCount: u._count.topics,
      allottedGroupsCount: u._count.groups,
    }));

    // Build map of domain -> array of experts
    const domainToFacultyMap = new Map<string, DomainExpertFacultyItem[]>();
    ALL_ECE_DOMAINS.forEach((domain) => {
      domainToFacultyMap.set(domain, []);
    });

    // Populate mappings
    facultyList.forEach((fac) => {
      fac.domainExpertise.forEach((d) => {
        const list = domainToFacultyMap.get(d);
        if (list) {
          list.push(fac);
        } else {
          // If a custom or edge domain exists
          domainToFacultyMap.set(d, [fac]);
        }
      });
    });

    // Structure categorized mappings
    let coveredDomainsCount = 0;
    const categories: DomainCategoryMapping[] = ECE_DOMAIN_CATEGORIES.map((cat) => {
      let catExpertsTotal = 0;
      let catCovered = 0;

      const domainItems: DomainMappingItem[] = cat.domains.map((dom) => {
        const experts = domainToFacultyMap.get(dom) || [];
        if (experts.length > 0) {
          catCovered++;
          coveredDomainsCount++;
        }
        catExpertsTotal += experts.length;

        return {
          domain: dom,
          categoryId: cat.id,
          categoryName: cat.name,
          experts,
          expertCount: experts.length,
        };
      });

      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        color: cat.color,
        domains: domainItems,
        totalExpertsInCat: catExpertsTotal,
        coveredDomainsCount: catCovered,
      };
    });

    // Calculate top domains
    const domainCounts: { domain: string; count: number }[] = [];
    domainToFacultyMap.forEach((experts, domain) => {
      domainCounts.push({ domain, count: experts.length });
    });
    domainCounts.sort((a, b) => b.count - a.count);
    const topDomains = domainCounts.filter((d) => d.count > 0).slice(0, 5);

    const completedProfiles = facultyList.filter((f) => f.domainExpertise.length > 0).length;
    const pendingProfiles = facultyList.length - completedProfiles;

    return {
      success: true,
      data: {
        facultyList,
        categories,
        stats: {
          totalFaculty: facultyList.length,
          completedProfiles,
          pendingProfiles,
          coveredDomainsCount,
          totalCatalogueDomains: ALL_ECE_DOMAINS.length,
          topDomains,
        },
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to load domain experts mapping: ${(err as Error).message}`,
    };
  }
}
