
import React, { useState } from 'react';
import { Case, CaseStatus, Urgency, UserRole, CaseNote } from '../types';
import { generateFormalLetter, explainAIReasoning } from '../services/geminiService';
import { ArrowLeft, Wand2, FileText, Info, Clock, ShieldCheck, UserCheck, Send, Plus, X, Target, CheckCircle2, Sparkles, Filter, Calendar, ArrowDownUp, RotateCcw, StickyNote, User, MapPin } from 'lucide-react';

interface CaseDetailProps {
  caseData: Case;
  onBack: () => void;
  onUpdate: (updatedCase: Case) => void;
  userRole: UserRole;
}

const CaseDetail: React.FC<CaseDetailProps> = ({ caseData, onBack, onUpdate, userRole }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'draft' | 'chat' | 'history' | 'notes'>('details');
  const [letterDraft, setLetterDraft] = useState(caseData.generatedLetter || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [newAgencyInput, setNewAgencyInput] = useState('');
  
  // Notes State
  const [newNote, setNewNote] = useState('');

  // History Filter State
  const [historyFilterRole, setHistoryFilterRole] = useState<string>('All');
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [historySortDesc, setHistorySortDesc] = useState<boolean>(true);

  const requiredApprovals = (caseData.urgency === Urgency.CRITICAL || caseData.urgency === Urgency.HIGH) ? 2 : 1;
  const approvalProgress = Math.min((caseData.approvals.length / requiredApprovals) * 100, 100);

  const getRoleDisplayName = () => {
    if (userRole === 'mp') return 'MP';
    if (userRole === 'admin') return 'Admin';
    return 'Writer';
  }

  const handleGenerateDraft = async () => {
    setIsGenerating(true);
    const draft = await generateFormalLetter(caseData);
    setLetterDraft(draft);
    setIsGenerating(false);

    const newHistory = [
        ...caseData.history,
        { timestamp: new Date(), action: 'Appeal Letter Draft Generated', user: `${getRoleDisplayName()} (You)` }
    ];

    onUpdate({ 
        ...caseData, 
        generatedLetter: draft, 
        status: CaseStatus.DRAFTING,
        history: newHistory
    });
  };

  const handleSubmitForReview = () => {
    const newHistory = [
        ...caseData.history,
        { timestamp: new Date(), action: 'Draft Submitted for Review', user: `${getRoleDisplayName()} (You)` }
    ];

    onUpdate({ 
        ...caseData, 
        status: CaseStatus.PENDING_APPROVAL,
        generatedLetter: letterDraft,
        history: newHistory
    });
    setActiveTab('history');
  };

  const handleMPApproval = () => {
    // Simulate a new approver ID based on role
    const newApproverId = `MP_Signoff_${Math.floor(Math.random() * 1000)}`;
    const updatedApprovals = [...caseData.approvals, newApproverId];
    
    const isApproved = updatedApprovals.length >= requiredApprovals;
    const newStatus = isApproved ? CaseStatus.APPROVED : CaseStatus.PENDING_APPROVAL;
    
    const newHistory = [
        ...caseData.history,
        { 
            timestamp: new Date(), 
            action: isApproved ? 'Case Fully Approved' : `Approval Grant (${updatedApprovals.length}/${requiredApprovals})`, 
            user: `${getRoleDisplayName()} (You)` 
        }
    ];

    onUpdate({
        ...caseData,
        status: newStatus,
        approvals: updatedApprovals,
        history: newHistory
    });
  };

  const handleExplainUrgency = async () => {
      const reason = await explainAIReasoning(
          `Summary: ${caseData.summary}, Category: ${caseData.category}, Resident Text: ${caseData.messages[caseData.messages.length-1]?.content}`,
          caseData.urgency
      );
      setExplanation(reason);
  };

  const handleAddAgency = () => {
    if (newAgencyInput.trim()) {
        const updated = [...(caseData.suggestedAgencies || []), newAgencyInput.trim()];
        onUpdate({...caseData, suggestedAgencies: updated});
        setNewAgencyInput('');
    }
  };

  const handleRemoveAgency = (index: number) => {
    const updated = [...(caseData.suggestedAgencies || [])];
    updated.splice(index, 1);
    onUpdate({...caseData, suggestedAgencies: updated});
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    
    const note: CaseNote = {
        id: Date.now().toString(),
        content: newNote,
        author: `${getRoleDisplayName()} (You)`,
        timestamp: new Date()
    };
    
    // Opt: Add to history as well for audit trail
    const newHistory = [
        ...caseData.history,
        { timestamp: new Date(), action: 'Internal Note Added', user: `${getRoleDisplayName()} (You)` }
    ];

    const updatedNotes = [...(caseData.internalNotes || []), note];
    onUpdate({ 
        ...caseData, 
        internalNotes: updatedNotes,
        history: newHistory
    });
    setNewNote('');
  };

  const resetHistoryFilters = () => {
      setHistoryFilterRole('All');
      setHistoryStartDate('');
      setHistoryEndDate('');
      setHistorySortDesc(true);
  };

  const getFilteredHistory = () => {
      return caseData.history.filter(event => {
          // Role Filter
          let roleMatch = true;
          if (historyFilterRole !== 'All') {
              const userLower = event.user.toLowerCase();
              if (historyFilterRole === 'Resident') {
                  roleMatch = userLower.includes('resident') || userLower.includes('system');
              } else if (historyFilterRole === 'AI Agent') {
                  roleMatch = userLower.includes('ai') || userLower.includes('bot');
              } else {
                  roleMatch = userLower.includes(historyFilterRole.toLowerCase());
              }
          }

          // Date Filter
          let dateMatch = true;
          const eventDate = new Date(event.timestamp);
          
          if (historyStartDate) {
              const start = new Date(historyStartDate);
              start.setHours(0, 0, 0, 0);
              dateMatch = dateMatch && eventDate >= start;
          }
          
          if (historyEndDate) {
              const end = new Date(historyEndDate);
              end.setHours(23, 59, 59, 999);
              dateMatch = dateMatch && eventDate <= end;
          }

          return roleMatch && dateMatch;
      }).sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return historySortDesc ? timeB - timeA : timeA - timeB;
      });
  };

  const filteredHistory = getFilteredHistory();

  // Permission checks
  const canApprove = userRole === 'mp' || userRole === 'admin';
  const canSubmit = userRole === 'writer' || userRole === 'admin';
  const canDraft = userRole === 'writer' || userRole === 'admin' || userRole === 'mp';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{caseData.residentName}</h2>
                {caseData.status === CaseStatus.APPROVED && (
                    <ShieldCheck className="text-green-600" size={20} />
                )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-mono">#{caseData.id.slice(-4)}</span>
                <span>•</span>
                <div className="flex items-center gap-1">
                    <MapPin size={12} className="text-red-500"/>
                    <span className="font-medium">{caseData.constituency}</span>
                    {caseData.division && (
                         <span className="text-gray-400">({caseData.division})</span>
                    )}
                </div>
            </div>
          </div>
          <span className={`ml-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
            ${caseData.urgency === Urgency.CRITICAL ? 'bg-red-100 text-red-800' : 
              caseData.urgency === Urgency.HIGH ? 'bg-orange-100 text-orange-800' :
              caseData.urgency === Urgency.MEDIUM ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'}`}>
            {caseData.urgency} Priority
          </span>
        </div>
        
        <div className="flex gap-3 items-center">
            {caseData.status === CaseStatus.PENDING_APPROVAL && (
                <div className="flex flex-col items-end mr-4">
                    <div className="text-xs text-gray-500 mb-1">Approval Progress</div>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${approvalProgress}%` }}></div>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">{caseData.approvals.length} / {requiredApprovals} signatures</div>
                </div>
            )}

            {canDraft && (caseData.status === CaseStatus.NEW || activeTab === 'draft') && (
                 <button 
                    onClick={handleGenerateDraft}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                    {isGenerating ? <Wand2 className="animate-spin" size={18}/> : <Wand2 size={18}/>}
                    <span>Auto-Draft</span>
                </button>
            )}

            {canSubmit && (caseData.status === CaseStatus.DRAFTING || caseData.status === CaseStatus.NEW) && letterDraft && (
                 <button 
                    onClick={handleSubmitForReview}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Send size={18}/>
                    <span>Submit for Review</span>
                </button>
            )}

            {canApprove && caseData.status === CaseStatus.PENDING_APPROVAL && (
                 <button 
                    onClick={handleMPApproval}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                    <UserCheck size={18}/>
                    <span>Approve (MP)</span>
                </button>
            )}
            
            {caseData.status === CaseStatus.APPROVED && (
                 <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed">
                    <ShieldCheck size={18}/>
                    <span>Case Approved</span>
                </div>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6">
        <button 
            onClick={() => setActiveTab('details')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            Case Details
        </button>
        <button 
            onClick={() => setActiveTab('chat')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'chat' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            Transcript
        </button>
        <button 
            onClick={() => setActiveTab('draft')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'draft' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            Appeal Letter
        </button>
        <button 
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'} flex items-center gap-2`}
        >
            <Clock size={16} />
            History
        </button>
        <button 
            onClick={() => setActiveTab('notes')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'notes' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'} flex items-center gap-2`}
        >
            <StickyNote size={16} />
            Private Notes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
        {activeTab === 'details' && (
            <div className="grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Categorization</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase">Primary Category</label>
                                <div className="mt-1 text-sm font-medium text-gray-900">{caseData.category}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase">Sub-Category</label>
                                <div className="mt-1 text-sm text-gray-900">{caseData.subCategory}</div>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-500 uppercase">Current Status</label>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className={`inline-block w-2 h-2 rounded-full ${caseData.status === CaseStatus.APPROVED ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                                    <span className="text-sm text-gray-900">{caseData.status}</span>
                                </div>
                            </div>
                             <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-500 uppercase">MP in Charge</label>
                                <div className="mt-1 text-sm font-medium text-gray-900">{caseData.mpName}</div>
                                <div className="text-xs text-gray-500">{caseData.division ? `${caseData.division} Division` : 'General Office'}</div>
                            </div>
                        </div>
                    </div>
                    
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Agencies Involved</h3>
                            <div className="text-xs text-gray-400 italic">Detected by AI</div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                            {caseData.suggestedAgencies?.map((agency, i) => (
                                <div key={i} className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-md text-sm font-medium border border-slate-200 group hover:border-red-200 transition-colors">
                                    <span>{agency}</span>
                                    <button onClick={() => handleRemoveAgency(i)} className="text-slate-400 hover:text-red-500 ml-1"><X size={12} /></button>
                                </div>
                            ))}
                            {(!caseData.suggestedAgencies || caseData.suggestedAgencies.length === 0) && (
                                <span className="text-sm text-gray-400">No agencies assigned yet.</span>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Add agency (e.g., HDB Branch)" 
                                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newAgencyInput}
                                onChange={(e) => setNewAgencyInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddAgency()}
                            />
                            <button 
                                onClick={handleAddAgency}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-md"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative group">
                        <div className="flex justify-between items-start mb-5">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <Sparkles size={18} className="text-indigo-500" />
                                AI Case Summary
                            </h3>
                            <button onClick={handleExplainUrgency} className="text-gray-400 hover:text-blue-600 transition-colors" title="Why is this important?">
                                <Info size={18} />
                            </button>
                        </div>
                        
                         <div className="mb-6">
                            <h4 className="text-xs font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1.5">
                                <Target size={14} /> Core Request
                            </h4>
                            <div className="text-gray-900 font-medium bg-indigo-50 p-4 rounded-lg border border-indigo-100 shadow-sm">
                                {caseData.coreRequest || caseData.summary}
                            </div>
                        </div>

                        <div className="mb-6">
                             <h4 className="text-xs font-bold text-teal-600 uppercase mb-2 flex items-center gap-1.5">
                                <CheckCircle2 size={14} /> Key Facts
                             </h4>
                             <div className="bg-teal-50 p-4 rounded-lg border border-teal-100 shadow-sm">
                                <ul className="space-y-2 text-sm text-gray-700">
                                    {caseData.keyFacts && caseData.keyFacts.length > 0 ? (
                                        caseData.keyFacts.map((fact, i) => (
                                            <li key={i} className="flex items-start gap-2.5">
                                                <div className="mt-0.5 text-teal-600 shrink-0"><CheckCircle2 size={14} /></div>
                                                <span>{fact}</span>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="italic text-gray-400 flex items-center gap-2">
                                            <Info size={14}/> No specific key facts extracted.
                                        </li>
                                    )}
                                </ul>
                             </div>
                        </div>

                        <div className="mb-1">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Full Summary</h4>
                            <p className="text-gray-600 text-sm leading-relaxed pl-1 border-l-2 border-gray-200">
                                {caseData.summary}
                            </p>
                        </div>
                        
                        {explanation && (
                            <div className="mt-4 p-4 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100 animate-in fade-in">
                                <strong>Reasoning:</strong> {explanation}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <h3 className="text-lg font-semibold mb-4 text-gray-800">Documents</h3>
                         {caseData.documents.length > 0 ? (
                             <ul className="space-y-2">
                                 {caseData.documents.map((doc, i) => (
                                     <li key={i} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-100 transition-colors cursor-pointer">
                                         <div className="bg-red-50 p-2 rounded">
                                             <FileText size={18} className="text-red-500" />
                                         </div>
                                         <div className="flex-1 min-w-0">
                                             <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                                             <p className="text-xs text-gray-500">{doc.type}</p>
                                         </div>
                                     </li>
                                 ))}
                             </ul>
                         ) : (
                             <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                 <FileText size={24} className="mx-auto mb-2 opacity-20" />
                                 <p className="text-sm">No documents uploaded.</p>
                             </div>
                         )}
                    </div>
                </div>
            </div>
        )}

        {/* ... (other tabs remain unchanged) ... */}
        {activeTab === 'chat' && (
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                 <div className="p-6 space-y-6">
                     {caseData.messages.map((m) => (
                         <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[80%] p-4 rounded-xl shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                                 <div className="flex justify-between items-center mb-1">
                                     <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{m.role === 'model' ? 'AI Assistant' : 'Resident'}</span>
                                     <span className="text-[10px] opacity-50">{new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                 </div>
                                 <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
        )}

        {activeTab === 'draft' && (
            <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-12 rounded-xl shadow-md border border-gray-200 min-h-[800px] flex flex-col">
                    <div className="flex justify-between mb-12 text-gray-500 text-sm font-serif border-b border-gray-100 pb-8">
                        <div>
                            <p className="font-bold text-gray-900 uppercase tracking-widest mb-1">Constituency Office</p>
                            <p>Reference: {caseData.id}</p>
                            {caseData.division && <p className="mt-1 text-xs">{caseData.division} Division</p>}
                        </div>
                        <div className="text-right">
                            <p>{new Date().toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                    </div>
                    <textarea 
                        className="flex-1 w-full resize-none focus:outline-none font-serif text-gray-800 leading-loose text-lg p-4 rounded-md focus:bg-gray-50"
                        value={letterDraft}
                        onChange={(e) => setLetterDraft(e.target.value)}
                        placeholder="Generate a draft to start editing..."
                    />
                    <div className="mt-12 pt-8 border-t border-gray-100 text-center">
                        <p className="font-serif text-gray-900 font-bold">Member of Parliament</p>
                        <p className="text-sm text-gray-500 mt-1">{caseData.mpName}</p>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Digital Signature Placeholder</p>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'history' && (
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Case History Log</h3>
                    <div className="bg-gray-100 px-3 py-1 rounded-full text-xs text-gray-500 font-medium">
                        {filteredHistory.length} Events
                    </div>
                </div>

                {/* Filters Toolbar */}
                <div className="mb-8 bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                        <Filter size={16} className="text-gray-400" />
                        <select 
                            value={historyFilterRole} 
                            onChange={(e) => setHistoryFilterRole(e.target.value)}
                            className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="All">All Roles</option>
                            <option value="Resident">Resident / System</option>
                            <option value="AI Agent">AI Agent</option>
                            <option value="Writer">Writer</option>
                            <option value="Admin">Admin</option>
                            <option value="MP">MP</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-gray-400" />
                        <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-md px-2 overflow-hidden">
                            <input 
                                type="date" 
                                value={historyStartDate}
                                onChange={(e) => setHistoryStartDate(e.target.value)}
                                className="py-1.5 text-xs focus:outline-none w-28"
                                placeholder="Start"
                            />
                            <span className="text-gray-400">-</span>
                            <input 
                                type="date" 
                                value={historyEndDate}
                                onChange={(e) => setHistoryEndDate(e.target.value)}
                                className="py-1.5 text-xs focus:outline-none w-28"
                                placeholder="End"
                            />
                        </div>
                    </div>

                    <button 
                        onClick={() => setHistorySortDesc(!historySortDesc)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition-colors"
                        title={historySortDesc ? "Newest First" : "Oldest First"}
                    >
                        <ArrowDownUp size={16} className={historySortDesc ? "text-blue-600" : "text-gray-400"} />
                        <span className="text-xs font-medium">{historySortDesc ? "Newest" : "Oldest"}</span>
                    </button>

                    {(historyFilterRole !== 'All' || historyStartDate || historyEndDate) && (
                         <button 
                            onClick={resetHistoryFilters}
                            className="ml-auto text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                            <RotateCcw size={12} /> Reset
                        </button>
                    )}
                </div>
                
                <div className="relative border-l-2 border-gray-200 ml-3 space-y-10 pb-4">
                    {filteredHistory.map((event, idx) => (
                        <div key={idx} className="relative pl-8 group">
                            <div className={`absolute -left-[9px] top-0 p-1 rounded-full border-2 border-white shadow-sm transition-colors
                                ${event.action.includes('Approved') ? 'bg-green-500' : 
                                  event.action.includes('Categorized') ? 'bg-blue-500' : 
                                  event.action.includes('Draft') ? 'bg-indigo-500' : 'bg-gray-400'}`}>
                                <div className="h-2 w-2 rounded-full bg-white"></div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline mb-1">
                                <p className="font-semibold text-gray-900">{event.action}</p>
                                <p className="text-xs font-mono text-gray-400">{event.timestamp.toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-medium">{event.user}</span>
                            </div>
                        </div>
                    ))}
                    
                    {filteredHistory.length === 0 && (
                         <div className="pl-8 py-8 text-center text-gray-400 italic bg-gray-50 rounded-lg">
                             No history events found matching these filters.
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'notes' && (
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-gray-900">Private Staff Notes</h3>
                    <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full text-xs font-medium border border-yellow-100">
                        <ShieldCheck size={12} />
                        Internal Use Only
                    </div>
                </div>

                {/* Notes List */}
                <div className="space-y-6 mb-8">
                    {caseData.internalNotes && caseData.internalNotes.length > 0 ? (
                        caseData.internalNotes.map((note) => (
                            <div key={note.id} className="flex gap-4 group">
                                <div className="flex-shrink-0">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                        <User size={20} />
                                    </div>
                                </div>
                                <div className="flex-1 bg-gray-50 p-4 rounded-2xl rounded-tl-none border border-gray-100">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-semibold text-sm text-gray-900">{note.author}</span>
                                        <span className="text-xs text-gray-400">{note.timestamp.toLocaleString()}</span>
                                    </div>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                             <StickyNote size={32} className="mx-auto mb-3 opacity-20" />
                             <p className="text-sm">No internal notes yet.</p>
                             <p className="text-xs opacity-70 mt-1">Notes are visible only to staff and MPs.</p>
                        </div>
                    )}
                </div>

                {/* Add Note Input */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
                    <textarea 
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Type a private note for the team..."
                        className="w-full p-4 text-sm focus:outline-none resize-none min-h-[100px]"
                    />
                    <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-t border-gray-100">
                        <span className="text-xs text-gray-400">Pressing enter adds a new line</span>
                        <button 
                            onClick={handleAddNote}
                            disabled={!newNote.trim()}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <Send size={14} />
                            Add Note
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default CaseDetail;
