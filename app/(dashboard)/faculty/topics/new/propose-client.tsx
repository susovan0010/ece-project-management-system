'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  getFacultyProposalMetadataAction,
  generateAiDescriptionDraftAction,
  evaluateAiTopicMappingAction,
  checkSdgCompatibilityAction,
  suggestSupportedSdgsAction,
  saveFacultyTopicProposalAction,
  checkCapstoneQualificationAction,
} from '@/app/actions/faculty-propose';
import { getFacultyTopicDetailAction } from '@/app/actions/faculty-topics';
import { SupervisorAiPicker } from '@/components/supervisor-ai-picker';
import { ATTRIBUTE_METADATA, SDG_METADATA } from '@/lib/attributes-metadata';
import { deriveMappedPoCodes } from '@/lib/engine';

interface AttributeItem {
  id: number;
  code: string;
  kind: 'WP' | 'WK' | 'EA';
  title: string;
  text: string;
}

interface SdgItem {
  id: number;
  title: string;
  description: string;
  targets: Array<{ id: string; description: string }>;
}

export default function ProposeTopicClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editCode = searchParams.get('edit') || searchParams.get('adopt');
  const [topicSource, setTopicSource] = useState<string | null>(null);
  const [isTitleLocked, setIsTitleLocked] = useState(false);

  // Metadata & state
  const [loading, setLoading] = useState(true);
  const [attributes, setAttributes] = useState<AttributeItem[]>([]);
  const [sdgs, setSdgs] = useState<SdgItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'Custom' | 'Hardware' | 'Software' | 'Both'>('Custom');
  const [domain, setDomain] = useState('');
  const [organization, setOrganization] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // AI draft state
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiDraftResult, setAiDraftResult] = useState<string | null>(null);
  const [autoRewriteEnabled, setAutoRewriteEnabled] = useState(true);
  const [isAutoRewriting, setIsAutoRewriting] = useState(false);
  const autoRewriteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mapping state: { [code]: { level: 0..3, reason: string, origin: 'RULE' | 'AI' | 'FACULTY' } }
  const [attrValues, setAttrValues] = useState<
    Record<string, { level: number; reason: string; origin: 'RULE' | 'AI' | 'FACULTY' }>
  >({});
  const [aiEvaluating, setAiEvaluating] = useState(false);

  // SDG state: { [sdgId]: { target?: string, reason?: string } }
  const [selectedSdgs, setSelectedSdgs] = useState<
    Record<number, { target?: string; reason?: string }>
  >({});

  // SDG Co-Satisfiability state
  const [sdgCompatibility, setSdgCompatibility] = useState<{
    satisfiable: boolean;
    explanation: string;
    incompatibleSdgs: number[];
    guidance: string;
  } | null>(null);
  const [isCheckingSdgs, setIsCheckingSdgs] = useState(false);
  const sdgCheckTimerRef = useRef<NodeJS.Timeout | null>(null);

  // SDG Suggestions state
  const [isSuggestingSdgs, setIsSuggestingSdgs] = useState(false);
  const [suggestedSdgs, setSuggestedSdgs] = useState<
    Array<{
      sdg: number;
      title: string;
      target: string;
      targetDescription: string;
      reason: string;
      confidence: 'HIGH' | 'MEDIUM';
    }> | null
  >(null);

  // Accreditation Matrix & Capstone Preview Visibility Toggle (Default: false)
  const [showAccreditationDetails, setShowAccreditationDetails] = useState(false);

  // Active Tab for mapping
  const [activeTab, setActiveTab] = useState<'WP' | 'WK' | 'EA'>('WP');

  // Word count computation
  const wordCount = description.trim() ? description.trim().split(/\s+/).length : 0;
  const isOverWordLimit = wordCount > 500;

  // Qualification State
  const [qualResult, setQualResult] = useState<{
    isQualified: boolean;
    breakdown: {
      wp1Met: boolean;
      wpOfSixMet: boolean;
      eaMet: boolean;
      hasSdgTarget: boolean;
    };
  }>({
    isQualified: false,
    breakdown: { wp1Met: false, wpOfSixMet: false, eaMet: false, hasSdgTarget: false },
  });

  // Derived Program Outcomes (POs) from current attributes
  const liveMappedPos = deriveMappedPoCodes(
    Object.entries(attrValues).map(([attrCode, val]) => ({
      level: val.level,
      attribute: { code: attrCode },
    }))
  );

  // Load initial catalogue and check for adopt code
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      const res = await getFacultyProposalMetadataAction();
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      setAttributes((res.attributes || []) as unknown as AttributeItem[]);
      setSdgs((res.sdgs || []) as unknown as SdgItem[]);

      // Initialize default 0 levels for attributes
      const initialMap: Record<
        string,
        { level: number; reason: string; origin: 'RULE' | 'AI' | 'FACULTY' }
      > = {};
      for (const a of res.attributes || []) {
        initialMap[a.code] = {
          level: 0,
          reason: '',
          origin: 'FACULTY',
        };
      }
      setAttrValues(initialMap);

      if (editCode) {
        // Fetch source topic to edit or customize
        const detailRes = await getFacultyTopicDetailAction(editCode);
        if (detailRes.topic) {
          const t = detailRes.topic;
          setCode(t.code);
          setTitle(t.title);
          setTopicSource(t.source);

          // Rule: SIH projects have locked titles; UG Research projects have editable titles
          if (t.source === 'SIH') {
            setIsTitleLocked(true);
          } else {
            setIsTitleLocked(false);
          }

          setCategory((t.category as any) || 'Hardware');
          setDomain(t.domain || '');
          setOrganization(t.organization || '');
          setDescription(t.description || '');
          setTags(t.tags || []);

          // Populate mapped attributes
          const adoptedAttrs = { ...initialMap };
          for (const a of t.attributes || []) {
            adoptedAttrs[a.attribute.code] = {
              level: a.level,
              reason: a.reason,
              origin: 'FACULTY',
            };
          }
          setAttrValues(adoptedAttrs);

          // Populate adopted SDGs
          const adoptedSdgs: Record<number, { target?: string; reason?: string }> = {};
          for (const s of t.sdgs || []) {
            adoptedSdgs[s.sdgId] = {
              target: s.target || undefined,
              reason: s.reason || undefined,
            };
          }
          setSelectedSdgs(adoptedSdgs);
        } else {
          setCode(res.nextCode || '');
        }
      } else {
        setCode(res.nextCode || '');
      }

      setLoading(false);
    }

    init();
  }, [editCode]);

  // Recalculate live Capstone Qualification
  useEffect(() => {
    async function updateQual() {
      const levels: Record<string, number> = {};
      for (const [code, val] of Object.entries(attrValues)) {
        levels[code] = val.level;
      }

      const hasSdgTarget = Object.values(selectedSdgs).some(
        (s) => s.target && s.target.trim().length > 0
      );

      const res = await checkCapstoneQualificationAction(levels, hasSdgTarget);
      setQualResult(res);
    }
    updateQual();
  }, [attrValues, selectedSdgs]);

  // Helpers to build statement-grounded payload
  function buildTargetAttributes(attrs: typeof attrValues) {
    return Object.entries(attrs)
      .filter(([_, val]) => val.level > 0)
      .map(([code, val]) => {
        const found = attributes.find((a) => a.code === code) || ATTRIBUTE_METADATA[code];
        return {
          code,
          level: val.level,
          title: found?.title,
          statement: (found as any)?.text || (found as any)?.statement,
          reason: val.reason,
        };
      });
  }

  function buildTargetSdgs(sdgMap: typeof selectedSdgs) {
    return Object.entries(sdgMap).map(([id, val]) => {
      const sdgId = parseInt(id, 10);
      const found = sdgs.find((s) => s.id === sdgId) || SDG_METADATA.find((s) => s.id === sdgId);
      const tgt = found?.targets.find((t) => t.id === val.target);
      return {
        sdg: sdgId,
        target: val.target,
        title: found?.title,
        targetDescription: tgt?.description,
        reason: val.reason,
      };
    });
  }

  // SDG Co-Satisfiability Trigger
  function triggerSdgCompatibilityCheck(currentSdgs: typeof selectedSdgs) {
    const count = Object.keys(currentSdgs).length;
    if (count <= 1) {
      setSdgCompatibility(null);
      if (sdgCheckTimerRef.current) clearTimeout(sdgCheckTimerRef.current);
      return;
    }

    if (sdgCheckTimerRef.current) clearTimeout(sdgCheckTimerRef.current);

    sdgCheckTimerRef.current = setTimeout(async () => {
      setIsCheckingSdgs(true);
      try {
        const payloadSdgs = Object.entries(currentSdgs).map(([id, val]) => {
          const sdgId = parseInt(id, 10);
          const found = sdgs.find((s) => s.id === sdgId) || SDG_METADATA.find((s) => s.id === sdgId);
          const tgt = found?.targets.find((t) => t.id === val.target);
          return {
            sdg: sdgId,
            title: found?.title,
            target: val.target,
            targetDescription: tgt?.description,
          };
        });

        const res = await checkSdgCompatibilityAction({
          title,
          category,
          theme: domain,
          tags,
          abstract: description,
          selectedSdgs: payloadSdgs,
        });

        if (res.result) {
          setSdgCompatibility(res.result);
        }
      } catch {
        // preserve current state on temporary network glitch
      } finally {
        setIsCheckingSdgs(false);
      }
    }, 800);
  }

  // Dynamic Auto-Rewrite Trigger on Attribute Level or SDG changes
  function triggerAutoRewrite(
    currentAttrs: typeof attrValues,
    currentSdgs: typeof selectedSdgs
  ) {
    if (!autoRewriteEnabled) return;
    if (!title.trim()) return;

    if (autoRewriteTimerRef.current) {
      clearTimeout(autoRewriteTimerRef.current);
    }

    autoRewriteTimerRef.current = setTimeout(async () => {
      setIsAutoRewriting(true);
      try {
        const targetAttributes = buildTargetAttributes(currentAttrs);
        const targetSdgs = buildTargetSdgs(currentSdgs);
        const firstSdg = Object.keys(currentSdgs)[0];
        const sdgHint = firstSdg ? `SDG ${firstSdg}` : undefined;

        const res = await generateAiDescriptionDraftAction({
          title,
          category,
          theme: domain,
          keywords: tags.length > 0 ? tags : [title],
          existingAbstract: description,
          targetAttributes,
          targetSdgs,
          sdgHint,
        });

        if (res.description) {
          setDescription(res.description);
          setAiDraftResult(
            `Abstract aligned via ${res.providerUsed} (${res.wordCount} words) to satisfy selected attribute criteria & SDGs`
          );
        }
      } catch {
        // Silently preserve current draft on temporary network issues
      } finally {
        setIsAutoRewriting(false);
      }
    }, 900);
  }

  // AI Draft Trigger (WP1 >= Level 2 Guaranteed, Statement-Grounded)
  async function handleGenerateAiDraft() {
    if (!title.trim()) {
      setError('Please provide a Topic Title before asking AI to draft an abstract.');
      return;
    }

    setAiDrafting(true);
    setError(null);
    setAiDraftResult(null);

    const targetAttributes = buildTargetAttributes(attrValues);
    const targetSdgs = buildTargetSdgs(selectedSdgs);
    const firstSdg = Object.keys(selectedSdgs)[0];
    const sdgHint = firstSdg ? `SDG ${firstSdg}` : undefined;

    const res = await generateAiDescriptionDraftAction({
      title,
      category,
      theme: domain,
      keywords: tags.length > 0 ? tags : [title],
      existingAbstract: description,
      targetAttributes,
      targetSdgs,
      sdgHint,
    });

    setAiDrafting(false);
    if (res.error) {
      setError(res.error);
    } else if (res.description) {
      setDescription(res.description);
      setAiDraftResult(`Drafted via ${res.providerUsed} (${res.wordCount} words) — WP1 Level 2+ satisfied with statement grounding`);
    }
  }

  // AI Suggest Supported SDGs
  async function handleSuggestSdgs() {
    if (!title.trim()) {
      setError('Please provide a Topic Title before asking AI to suggest SDGs.');
      return;
    }

    setIsSuggestingSdgs(true);
    setError(null);
    try {
      const res = await suggestSupportedSdgsAction({
        title,
        category,
        theme: domain,
        tags,
        abstract: description,
      });

      if (res.error) {
        setError(res.error);
      } else if (res.suggestions) {
        setSuggestedSdgs(res.suggestions);
      }
    } catch (err) {
      setError(`Failed to suggest SDGs: ${(err as Error).message}`);
    } finally {
      setIsSuggestingSdgs(false);
    }
  }

  function handleApplyAllSuggestedSdgs() {
    if (!suggestedSdgs || suggestedSdgs.length === 0) return;
    const updated = { ...selectedSdgs };
    for (const sug of suggestedSdgs) {
      updated[sug.sdg] = {
        target: sug.target,
        reason: sug.reason,
      };
    }
    setSelectedSdgs(updated);
    triggerAutoRewrite(attrValues, updated);
    triggerSdgCompatibilityCheck(updated);
  }

  function handleApplySingleSuggestedSdg(sug: { sdg: number; target: string; reason: string }) {
    const updated = {
      ...selectedSdgs,
      [sug.sdg]: { target: sug.target, reason: sug.reason },
    };
    setSelectedSdgs(updated);
    triggerAutoRewrite(attrValues, updated);
    triggerSdgCompatibilityCheck(updated);
  }

  function handleRemoveIncompatibleSdgs() {
    if (!sdgCompatibility?.incompatibleSdgs || sdgCompatibility.incompatibleSdgs.length === 0) return;
    const updated = { ...selectedSdgs };
    for (const id of sdgCompatibility.incompatibleSdgs) {
      delete updated[id];
    }
    setSelectedSdgs(updated);
    setSdgCompatibility(null);
    triggerAutoRewrite(attrValues, updated);
  }

  // AI Complexity Evaluator Trigger (Evaluates WPs, WKs, EAs, and suitable SDGs)
  async function handleEvaluateAiComplexity() {
    if (!description.trim()) {
      setError('Please provide or draft a Project Abstract before evaluating complexity.');
      return;
    }

    setAiEvaluating(true);
    setError(null);

    const res = await evaluateAiTopicMappingAction({
      title,
      description,
      category,
      theme: domain,
      tags,
    });

    setAiEvaluating(false);
    if (res.error) {
      setError(res.error);
    } else if (res.mapping) {
      const updated = { ...attrValues };
      for (const a of res.mapping.attributes) {
        if (updated[a.code]) {
          updated[a.code] = {
            level: a.level,
            reason: a.reason,
            origin: res.origin,
          };
        }
      }
      setAttrValues(updated);

      // Auto-populate suitable SDGs from AI
      const updatedSdgs = { ...selectedSdgs };
      for (const s of res.mapping.sdgs) {
        const foundSdg = sdgs.find((item) => item.id === s.sdg);
        const validTarget = foundSdg?.targets.some((t) => t.id === s.target)
          ? s.target
          : foundSdg?.targets[0]?.id || s.target;

        updatedSdgs[s.sdg] = {
          target: validTarget || '',
          reason: s.reason || '',
        };
      }
      setSelectedSdgs(updatedSdgs);
      triggerSdgCompatibilityCheck(updatedSdgs);
      setAiDraftResult(`Complexity evaluated & suitable SDGs auto-mapped via ${res.providerUsed}`);
    }
  }

  // Tag helper
  function handleAddTag() {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  }

  function handleRemoveTag(t: string) {
    setTags(tags.filter((item) => item !== t));
  }

  // Save proposal
  async function handleSave(status: 'DRAFT' | 'CONFIRMED') {
    if (!title.trim()) {
      setError('Topic Title is required.');
      return;
    }
    if (!description.trim()) {
      setError('Project Abstract is a mandatory field and cannot be blank. No project can be submitted or confirmed without an abstract.');
      return;
    }
    if (isOverWordLimit) {
      setError(`Abstract must not exceed 500 words (currently ${wordCount} words).`);
      return;
    }

    setSubmitting(true);
    setError(null);

    // Format attributes
    const formattedAttributes = Object.entries(attrValues)
      .filter(([_, val]) => val.level > 0 || val.reason)
      .map(([code, val]) => ({
        code,
        level: val.level,
        reason: val.reason || `Evaluated via ${val.origin}`,
        origin: val.origin,
      }));

    // Format SDGs
    const formattedSdgs = Object.entries(selectedSdgs).map(([id, val]) => ({
      sdgId: Number(id),
      target: val.target,
      reason: val.reason,
    }));

    const res = await saveFacultyTopicProposalAction({
      code,
      title: title.trim(),
      category,
      domain: domain.trim() || undefined,
      organization: organization.trim() || undefined,
      description: description.trim(),
      tags,
      status,
      attributes: formattedAttributes,
      sdgs: formattedSdgs,
      isEditingExisting: Boolean(editCode),
      reEvaluateAiOnConfirm: status === 'CONFIRMED',
    });

    setSubmitting(false);

    if (res.error) {
      setError(res.error);
    } else {
      router.push('/faculty/my-topics');
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                {code}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                Faculty Proposal Workspace
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">
              {editCode
                ? `Edit & Customize Project: ${code || editCode}`
                : 'Propose Capstone Project Topic'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Draft project scope, leverage supervisor-chosen AI models, and calibrate Washington Accord attributes.
            </p>
          </div>

          <Link
            href="/faculty/topics"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
          >
            ← Back to Topic Bank
          </Link>
        </div>
      </div>

      {/* Supervisor AI Picker Choice Banner */}
      <SupervisorAiPicker />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column (8 cols): Metadata, Abstract, and Complexity Sliders */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Project Metadata */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider border-b border-slate-100 pb-2">
              1. Project Definition & Domain
            </h2>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Project Title <span className="text-red-500">*</span>
                </label>
                {isTitleLocked ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    🔒 SIH Title Locked
                  </span>
                ) : topicSource === 'UG_RESEARCH' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    📝 UG Research (Editable Title)
                  </span>
                ) : null}
              </div>
              <input
                type="text"
                required
                disabled={isTitleLocked}
                readOnly={isTitleLocked}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Design of Quad-Band Sub-6 GHz MIMO Antenna for 5G V2X Telemetry"
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 transition ${
                  isTitleLocked
                    ? 'bg-slate-100 border-slate-300 cursor-not-allowed text-slate-700 font-medium'
                    : 'bg-white border-slate-300'
                }`}
              />
              {isTitleLocked ? (
                <p className="text-xs text-amber-800 mt-1.5 flex items-center gap-1.5 font-medium bg-amber-50 p-2 rounded border border-amber-200">
                  <span>🔒</span>
                  <span>
                    Smart India Hackathon (SIH) titles are locked to preserve official problem statement specifications. You can edit and refine the abstract below.
                  </span>
                </p>
              ) : topicSource === 'UG_RESEARCH' ? (
                <p className="text-xs text-emerald-800 mt-1 flex items-center gap-1 font-medium">
                  <span>✓</span>
                  <span>UG Research Project: Title and abstract are fully customizable by supervisor.</span>
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                >
                  <option value="Custom">Custom</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Software">Software</option>
                  <option value="Both">Both (Hybrid)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Theme <span className="text-indigo-600">(e.g. Disaster Management, Transportation &amp; Logistics)</span>
                </label>
                <input
                  type="text"
                  list="project-theme-options"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. Disaster Management, Transportation & Logistics"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
                <datalist id="project-theme-options">
                  <option value="Disaster Management" />
                  <option value="Transportation & Logistics" />
                  <option value="MedTech / BioTech / HealthTech" />
                  <option value="Clean & Green Technology" />
                  <option value="Smart Automation & IoT" />
                  <option value="Robotics & Drones" />
                  <option value="Agriculture, FoodTech & Rural Development" />
                  <option value="VLSI & Embedded Systems" />
                  <option value="RF, Antenna & 5G/6G Communications" />
                </datalist>
              </div>
            </div>

            {/* Keyword Tags */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Technical Keywords / Tags
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Type tag and press Add or Enter (e.g. CST, LoRa, FPGA)"
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Add Tag
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: 500-Word Abstract & AI Draft Generator */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-2">
              <div>
                <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  2. Project Abstract (Max 500 Words) <span className="text-red-500">* (Mandatory)</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Strictly mandatory and capped at 500 words for departmental standardization and NBA audit defense.
                </p>
              </div>

              {/* AI Draft Trigger & Auto-Rewrite Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 transition">
                  <input
                    type="checkbox"
                    checked={autoRewriteEnabled}
                    onChange={(e) => setAutoRewriteEnabled(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>✨ Auto-Rewrite on Attribute/SDG Change</span>
                </label>

                <button
                  type="button"
                  onClick={handleGenerateAiDraft}
                  disabled={aiDrafting || isAutoRewriting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {aiDrafting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-indigo-600" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Drafting with AI...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Draft Abstract with AI
                    </>
                  )}
                </button>
              </div>
            </div>

            {isAutoRewriting && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs flex items-center gap-2 animate-pulse">
                <svg className="animate-spin h-3.5 w-3.5 text-indigo-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="font-semibold">
                  AI is auto-rewriting abstract to reflect calibrated Washington Accord levels &amp; SDGs (WP1 ≥ Level 2)...
                </span>
              </div>
            )}

            {aiDraftResult && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex justify-between items-center">
                <span>{aiDraftResult}</span>
                <span className="text-[11px] text-emerald-600 font-semibold">Faculty may edit freely</span>
              </div>
            )}

            <div>
              <textarea
                rows={9}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detail the Problem Statement, Engineering Methodology, Expected Hardware/Software Prototype Deliverables, and Relevance to Sustainable Development Goals..."
                className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans ${
                  isOverWordLimit
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20 text-red-900'
                    : 'border-slate-300 text-slate-900'
                }`}
              />

              {/* Word Count Indicator */}
              <div className="flex justify-between items-center mt-1 text-xs">
                <span className="text-slate-400">
                  Tip: Cover technical depth (Maxwell equations, pipelining, sensor interfacing).
                </span>
                <span
                  className={`font-mono font-bold ${
                    isOverWordLimit ? 'text-red-600 animate-pulse' : wordCount > 450 ? 'text-amber-600' : 'text-slate-600'
                  }`}
                >
                  {wordCount} / 500 words {isOverWordLimit && '(Exceeds 500 limit!)'}
                </span>
              </div>
            </div>

            {/* Live Program Outcomes (POs) & Dynamic AI Re-tagging */}
            <div className="p-3.5 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-xl space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Mapped Program Outcomes (POs):
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Derived from Abstract WK &amp; SDG Profile
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Updating the abstract dynamically changes attribute and PO mappings once confirmed, or re-tag directly:
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleEvaluateAiComplexity}
                  disabled={aiEvaluating || !description.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
                >
                  {aiEvaluating ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Re-tagging with AI...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Re-tag Attributes, SDGs &amp; POs with AI
                    </>
                  )}
                </button>
              </div>

              {/* Tagged PO Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-blue-100">
                {liveMappedPos.length > 0 ? (
                  liveMappedPos.map((po) => (
                    <span
                      key={po}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-white text-blue-800 border border-blue-300 shadow-sm"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      {po}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">
                    No POs mapped yet. Provide an abstract and click &quot;Re-tag Attributes, SDGs &amp; POs with AI&quot;.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sliding Switch Banner: Washington Accord Attribute Matrix & SDG Mapping Visibility */}
          <div className="bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0 mt-0.5 sm:mt-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Washington Accord Attribute Matrix &amp; SDG Mapping
                  </h3>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      showAccreditationDetails
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {showAccreditationDetails ? 'Visualized (ON)' : 'Hidden by Default (OFF)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {showAccreditationDetails
                    ? 'Attribute matrices, SDG targets, and live capstone qualification preview are currently visible for custom calibration.'
                    : 'AI automatically calibrates Washington Accord levels (WP1 ≥ Level 2) and SDG mappings in the background as you write. Slide switch ON to inspect or customize.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
              <span className="text-xs font-bold text-slate-700">
                {showAccreditationDetails ? 'ON' : 'OFF'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showAccreditationDetails}
                onClick={() => setShowAccreditationDetails(!showAccreditationDetails)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                  showAccreditationDetails ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showAccreditationDetails ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Conditional Display of Section 3 (Attribute Matrix) and Section 4 (SDG Matrix) */}
          {showAccreditationDetails && (
            <>
              {/* Card 3: Washington Accord Complexity Sliders */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-2">
              <div>
                <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  3. Washington Accord Attribute Matrix
                </h2>
                <p className="text-xs text-slate-500">
                  Calibrate level (0 to 3) for Complex Problem Solving (WP), Knowledge (WK), and Activities (EA).
                </p>
              </div>

              {/* AI Complexity Evaluate Button */}
              <button
                type="button"
                onClick={handleEvaluateAiComplexity}
                disabled={aiEvaluating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {aiEvaluating ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Evaluating with AI...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Auto-Map via AI / Rules
                  </>
                )}
              </button>
            </div>

            {/* Kind Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('WP')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                  activeTab === 'WP'
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Complex Problem Solving (WP1 – WP7)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('WK')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                  activeTab === 'WK'
                    ? 'border-blue-500 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Engineering Knowledge (WK1 – WK9)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('EA')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                  activeTab === 'EA'
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Complex Activities (EA1 – EA5)
              </button>
            </div>

            {/* Active Kind Attributes List */}
            <div className="space-y-4 pt-2">
              {attributes
                .filter((a) => a.kind === activeTab)
                .map((attr) => {
                  const current = attrValues[attr.code] || { level: 0, reason: '', origin: 'FACULTY' };

                  return (
                    <div
                      key={attr.code}
                      className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {attr.code}
                            </span>
                            <span className="font-semibold text-xs text-slate-800">{attr.title}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{attr.text}</p>
                        </div>

                        {/* Level Selector 0..3 */}
                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-600">Level:</span>
                          {[0, 1, 2, 3].map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => {
                                const updatedAttrs = {
                                  ...attrValues,
                                  [attr.code]: {
                                    ...current,
                                    level: lvl,
                                    origin: 'FACULTY' as const,
                                  },
                                };
                                setAttrValues(updatedAttrs);
                                triggerAutoRewrite(updatedAttrs, selectedSdgs);
                              }}
                              className={`w-6 h-6 rounded text-xs font-bold transition ${
                                current.level === lvl
                                  ? lvl >= 2
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'bg-slate-700 text-white shadow-sm'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Origin Pill & Justification */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                        <div className="sm:col-span-2 flex items-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              current.origin === 'AI'
                                ? 'bg-indigo-100 text-indigo-700'
                                : current.origin === 'RULE'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            Origin: {current.origin}
                          </span>
                        </div>
                        <div className="sm:col-span-10">
                          <input
                            type="text"
                            value={current.reason}
                            onChange={(e) => {
                              setAttrValues({
                                ...attrValues,
                                [attr.code]: {
                                  ...current,
                                  reason: e.target.value,
                                  origin: 'FACULTY',
                                },
                              });
                            }}
                            placeholder="Engineering rationale (e.g. Requires full-wave HFSS simulation / Verilog pipelining)..."
                            className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Card 4: UN SDG Target Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  4. UN Sustainable Development Goals (SDG) Alignment
                </h2>
                <p className="text-xs text-slate-500">
                  Capstone projects must address at least one named SDG target (e.g. Target 7.2 or 9.5) with direct relevance.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSuggestSdgs}
                disabled={isSuggestingSdgs || !title.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-md transition disabled:opacity-50 shrink-0"
              >
                {isSuggestingSdgs ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing Project Scope...</span>
                  </>
                ) : (
                  <>
                    <span>💡 Suggest Supported SDGs via AI</span>
                  </>
                )}
              </button>
            </div>

            {/* AI Suggested SDGs Box */}
            {suggestedSdgs && suggestedSdgs.length > 0 && (
              <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>🎯 AI Recommended SDGs for this Project</span>
                    <span className="text-[10px] font-normal text-emerald-700">
                      ({suggestedSdgs.length} recommended)
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleApplyAllSuggestedSdgs}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
                    >
                      Apply All Suggested SDGs
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestedSdgs(null)}
                      className="text-[11px] text-slate-400 hover:text-slate-600"
                    >
                      ✕ Dismiss
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {suggestedSdgs.map((sug) => {
                    const isAlreadySelected = !!selectedSdgs[sug.sdg];
                    return (
                      <div
                        key={sug.sdg}
                        className="bg-white p-2.5 rounded border border-emerald-100 text-xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-900">
                              Goal {sug.sdg}: {sug.title}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                sug.confidence === 'HIGH'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {sug.confidence} Match
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">
                            <strong className="text-emerald-700">Target {sug.target}:</strong> {sug.targetDescription}
                          </p>
                          <p className="text-[11px] text-slate-500 italic mt-0.5">{sug.reason}</p>
                        </div>

                        <div className="mt-2 text-right">
                          {isAlreadySelected ? (
                            <span className="text-[11px] font-medium text-emerald-600">✓ Selected</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplySingleSuggestedSdg(sug)}
                              className="px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
                            >
                              + Select SDG {sug.sdg}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SDG Co-Satisfiability Status Banner */}
            {isCheckingSdgs && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2 animate-pulse">
                <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>AI evaluating simultaneous co-satisfiability across selected SDGs...</span>
              </div>
            )}

            {!isCheckingSdgs && sdgCompatibility && !sdgCompatibility.satisfiable && (
              <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-lg text-xs space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-600 text-base">⚠️</span>
                    <div>
                      <h4 className="font-bold text-amber-900">Selected SDGs Co-Satisfiability Warning</h4>
                      <p className="text-amber-800 mt-0.5">{sdgCompatibility.explanation}</p>
                      {sdgCompatibility.guidance && (
                        <p className="text-amber-700 font-medium mt-1">
                          <strong>Advisor Guidance:</strong> {sdgCompatibility.guidance}
                        </p>
                      )}
                    </div>
                  </div>

                  {sdgCompatibility.incompatibleSdgs.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveIncompatibleSdgs}
                      className="px-2.5 py-1 text-xs font-semibold bg-amber-200 text-amber-900 hover:bg-amber-300 rounded transition shrink-0"
                    >
                      Remove Incompatible (
                      {sdgCompatibility.incompatibleSdgs.map((id) => `SDG ${id}`).join(', ')})
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isCheckingSdgs &&
              sdgCompatibility &&
              sdgCompatibility.satisfiable &&
              Object.keys(selectedSdgs).length > 1 && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs flex items-center justify-between text-emerald-800">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-emerald-700">✓</span>
                    <span>
                      <strong>Simultaneous Co-Satisfiability Verified:</strong> {sdgCompatibility.explanation}
                    </span>
                  </div>
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {sdgs.map((sdg) => {
                const isSelected = !!selectedSdgs[sdg.id];
                const currentData = selectedSdgs[sdg.id] || {};

                return (
                  <div
                    key={sdg.id}
                    className={`p-3 rounded-lg border text-xs transition ${
                      isSelected ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            let updatedSdgs: typeof selectedSdgs;
                            if (e.target.checked) {
                              updatedSdgs = {
                                ...selectedSdgs,
                                [sdg.id]: { target: sdg.targets[0]?.id || '', reason: '' },
                              };
                            } else {
                              updatedSdgs = { ...selectedSdgs };
                              delete updatedSdgs[sdg.id];
                            }
                            setSelectedSdgs(updatedSdgs);
                            triggerAutoRewrite(attrValues, updatedSdgs);
                            triggerSdgCompatibilityCheck(updatedSdgs);
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-slate-900">
                          Goal {sdg.id}: {sdg.title}
                        </span>
                      </label>
                    </div>

                    {isSelected && (
                      <div className="mt-2.5 space-y-2 pt-2 border-t border-indigo-100">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                            Specific Target:
                          </label>
                          <select
                            value={currentData.target || ''}
                            onChange={(e) => {
                              const updatedSdgs = {
                                ...selectedSdgs,
                                [sdg.id]: { ...currentData, target: e.target.value },
                              };
                              setSelectedSdgs(updatedSdgs);
                              triggerAutoRewrite(attrValues, updatedSdgs);
                              triggerSdgCompatibilityCheck(updatedSdgs);
                            }}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                          >
                            <option value="">Select target</option>
                            {sdg.targets.map((tgt) => (
                              <option key={tgt.id} value={tgt.id}>
                                Target {tgt.id} - {tgt.description.slice(0, 50)}...
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <input
                            type="text"
                            value={currentData.reason || ''}
                            onChange={(e) => {
                              setSelectedSdgs({
                                ...selectedSdgs,
                                [sdg.id]: { ...currentData, reason: e.target.value },
                              });
                            }}
                            placeholder="Direct impact rationale..."
                            className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded bg-white text-slate-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>

        {/* Right Column (4 cols): Capstone Qualification Preview (Toggleable) & Proposal Submission Actions */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm sticky top-6 space-y-5">
            {/* Header with Title and Sliding Toggle */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                {showAccreditationDetails ? 'Capstone Qualification' : 'Topic Submission'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAccreditationDetails(!showAccreditationDetails)}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded transition ${
                  showAccreditationDetails
                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {showAccreditationDetails ? 'Hide Details' : 'Show Details'}
              </button>
            </div>

            {/* When showAccreditationDetails is TRUE: Show full Capstone Qualification Preview Gauge & Checklist */}
            {showAccreditationDetails ? (
              <>
                {/* Gauge Status Banner */}
                <div
                  className={`p-4 rounded-xl border text-center transition ${
                    qualResult.isQualified
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center font-bold text-lg bg-white shadow-sm">
                    {qualResult.isQualified ? '✓' : '!'}
                  </div>
                  <h4 className="font-bold text-sm">
                    {qualResult.isQualified ? 'Meets Capstone Standards' : 'Threshold Not Met'}
                  </h4>
                  <p className="text-xs mt-1 opacity-90">
                    {qualResult.isQualified
                      ? 'All Step 1 accreditation qualification gates passed.'
                      : 'Adjust attribute levels or link an SDG target to qualify.'}
                  </p>
                </div>

                {/* Checklist */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                    <span className="font-medium text-slate-700">1. WP1 Depth of Knowledge (≥ Level 2)</span>
                    <span className={`font-bold ${qualResult.breakdown.wp1Met ? 'text-emerald-600' : 'text-red-500'}`}>
                      {qualResult.breakdown.wp1Met ? 'PASS' : 'FAIL'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                    <span className="font-medium text-slate-700">2. Three of WP2..WP7 (≥ Level 2)</span>
                    <span className={`font-bold ${qualResult.breakdown.wpOfSixMet ? 'text-emerald-600' : 'text-red-500'}`}>
                      {qualResult.breakdown.wpOfSixMet ? 'PASS' : 'FAIL'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                    <span className="font-medium text-slate-700">3. Two of EA1..EA5 (≥ Level 2)</span>
                    <span className={`font-bold ${qualResult.breakdown.eaMet ? 'text-emerald-600' : 'text-red-500'}`}>
                      {qualResult.breakdown.eaMet ? 'PASS' : 'FAIL'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                    <span className="font-medium text-slate-700">4. At least one SDG Target named</span>
                    <span className={`font-bold ${qualResult.breakdown.hasSdgTarget ? 'text-emerald-600' : 'text-red-500'}`}>
                      {qualResult.breakdown.hasSdgTarget ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              /* When showAccreditationDetails is FALSE (Default): Clean, uncluttered supervisor summary */
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Abstract Length:</span>
                    <span
                      className={`font-mono font-bold ${
                        isOverWordLimit
                          ? 'text-red-600'
                          : wordCount > 0
                          ? 'text-emerald-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {wordCount} / 500 words
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Proposal Mode:</span>
                    <span className="font-semibold text-slate-700">{category}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-indigo-900">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>AI Accreditation Tracking Active</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 leading-relaxed">
                    Washington Accord criteria (WP1 ≥ Level 2) and SDG mappings are being calibrated in the background.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAccreditationDetails(true)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline block pt-0.5"
                  >
                    Turn ON Attribute Matrix &amp; Preview Switch →
                  </button>
                </div>
              </div>
            )}

            {/* Actions: Always available */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => handleSave('CONFIRMED')}
                disabled={submitting || isOverWordLimit}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? 'Submitting Proposal...' : 'Submit & Confirm Proposal'}
              </button>

              <button
                type="button"
                onClick={() => handleSave('DRAFT')}
                disabled={submitting || isOverWordLimit}
                className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition disabled:opacity-50"
              >
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
