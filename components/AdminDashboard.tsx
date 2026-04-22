
import React, { useState, useMemo, useEffect } from 'react';
import { Case, CaseStatus, Urgency, UserRole } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AlertCircle, CheckCircle, Clock, FileText, Search, Filter, LogOut, User, PenTool, Gavel, ShieldAlert, X } from 'lucide-react';
import CaseDetail from './CaseDetail';

interface AdminDashboardProps {
  cases: Case[];
  onUpdateCase: (updatedCase: Case) => void;
  userRole: UserRole;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ cases, onUpdateCase, userRole, onLogout }) => {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  
  // Filter & Search States
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Default filter for MP to show pending approvals first
  useEffect(() => {
      if (userRole === 'mp') {
          setStatusFilter(CaseStatus.PENDING_APPROVAL);
      } else {
          setStatusFilter('All');
      }
      // Reset others
      setUrgencyFilter('All');
      setSearchTerm('');
  }, [userRole]);

  const stats = useMemo(() => {
    const urgencyCount = cases.reduce((acc, c) => {
      acc[c.urgency] = (acc[c.urgency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusCount = cases.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { urgencyCount, statusCount };
  }, [cases]);

  const pieData = Object.keys(stats.urgencyCount).map(key => ({ name: key, value: stats.urgencyCount[key] }));
  const COLORS = { 'Low': '#4ade80', 'Medium': '#facc15', 'High': '#f97316', 'Critical': '#ef4444' };

  const filteredCases = cases.filter(c => {
      const matchStatus = statusFilter === 'All' || c.status === statusFilter;
      const matchUrgency = urgencyFilter === 'All' || c.urgency === urgencyFilter;
      
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || 
          c.residentName.toLowerCase().includes(searchLower) ||
          c.nricMasked.toLowerCase().includes(searchLower) ||
          c.id.toLowerCase().includes(searchLower);
      
      return matchStatus && matchUrgency && matchSearch;
  });

  const clearFilters = () => {
      setStatusFilter('All');
      setUrgencyFilter('All');
      setSearchTerm('');
  };

  const handleSidebarClick = (status: string) => {
      setStatusFilter(status);
      setUrgencyFilter('All');
      setSearchTerm('');
  };

  if (selectedCase) {
    return (
        <CaseDetail 
            caseData={selectedCase} 
            userRole={userRole}
            onBack={() => setSelectedCase(null)}
            onUpdate={(c) => {
                onUpdateCase(c);
                setSelectedCase(c); // Keep view open but updated
            }}
        />
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar / Navigation */}
      <div className="w-64 bg-slate-900 text-white flex flex-col shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-tight">MPS Connect</h1>
          <div className="flex items-center gap-2 mt-2">
            {userRole === 'mp' && <Gavel size={14} className="text-green-400"/>}
            {userRole === 'admin' && <ShieldAlert size={14} className="text-indigo-400"/>}
            {userRole === 'writer' && <PenTool size={14} className="text-blue-400"/>}
            <p className="text-xs text-slate-400 uppercase tracking-wider">
                {userRole === 'mp' ? 'Member of Parliament' : userRole === 'admin' ? 'Constituency Admin' : 'Case Writer'}
            </p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => handleSidebarClick('All')}
            className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${statusFilter === 'All' && urgencyFilter === 'All' ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            Dashboard Overview
          </button>
          <div className="pt-4 pb-2 px-4 text-xs text-slate-500 uppercase tracking-wider font-bold">Case Management</div>
          <button 
            onClick={() => handleSidebarClick(CaseStatus.NEW)}
            className={`w-full text-left px-4 py-2 rounded-lg text-sm flex justify-between ${statusFilter === CaseStatus.NEW ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span>New Inquiries</span>
            <span className="bg-red-500 text-white text-xs py-0.5 px-2 rounded-full">{stats.statusCount[CaseStatus.NEW] || 0}</span>
          </button>
          <button 
            onClick={() => handleSidebarClick(CaseStatus.PENDING_APPROVAL)}
            className={`w-full text-left px-4 py-2 rounded-lg text-sm flex justify-between ${statusFilter === CaseStatus.PENDING_APPROVAL ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span>Pending Approval</span>
             <span className="bg-yellow-500 text-black text-xs py-0.5 px-2 rounded-full">{stats.statusCount[CaseStatus.PENDING_APPROVAL] || 0}</span>
          </button>
          <button 
            onClick={() => handleSidebarClick(CaseStatus.APPROVED)}
            className={`w-full text-left px-4 py-2 rounded-lg text-sm flex justify-between ${statusFilter === CaseStatus.APPROVED ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span>Approved</span>
             <span className="bg-green-500 text-black text-xs py-0.5 px-2 rounded-full">{stats.statusCount[CaseStatus.APPROVED] || 0}</span>
          </button>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
            <button onClick={onLogout} className="flex items-center gap-3 text-slate-400 hover:text-white w-full transition-colors">
                <LogOut size={18} />
                <span className="text-sm font-medium">Sign Out</span>
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8">
        
        {statusFilter === 'All' && urgencyFilter === 'All' && !searchTerm && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-in fade-in duration-500">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-500 mb-4">Urgency Distribution</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={(COLORS as any)[entry.name]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 col-span-2">
                    <h3 className="text-sm font-semibold text-gray-500 mb-4">Cases by Status</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={Object.keys(stats.statusCount).map(k => ({name: k, count: stats.statusCount[k]}))}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{fill: '#f3f4f6'}} />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        )}

        <div className="flex flex-col space-y-4 mb-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">
                    {statusFilter !== 'All' ? statusFilter : 'Case Management'}
                </h2>
                <div className="flex gap-2">
                   {(statusFilter !== 'All' || urgencyFilter !== 'All' || searchTerm) && (
                       <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 px-3 py-2 transition-colors">
                           <X size={16} /> Reset Filters
                       </button>
                   )}
                </div>
            </div>

            <div className="flex gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search NRIC, Name, or ID..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" 
                    />
                </div>

                {/* Status Filter Dropdown */}
                <div className="relative min-w-[160px]">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none">
                        <Filter size={14} />
                    </div>
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-red-500 outline-none bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                        <option value="All">All Statuses</option>
                        {Object.values(CaseStatus).map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                {/* Urgency Filter Dropdown */}
                <div className="relative min-w-[160px]">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none">
                        <AlertCircle size={14} />
                    </div>
                    <select 
                        value={urgencyFilter}
                        onChange={(e) => setUrgencyFilter(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-red-500 outline-none bg-white cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                        <option value="All">All Urgencies</option>
                        {Object.values(Urgency).map(u => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">ID & Date</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Resident</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Urgency</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {filteredCases.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-500">
                                <div className="font-mono text-gray-900">#{c.id.slice(-4)}</div>
                                <div className="text-xs">{new Date(c.createdAt).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="text-sm font-medium text-gray-900">{c.residentName}</div>
                                <div className="text-xs text-gray-500">{c.nricMasked}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                                <span className="block font-medium">{c.category}</span>
                                <span className="text-xs">{c.subCategory}</span>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                    ${c.urgency === Urgency.CRITICAL ? 'bg-red-100 text-red-800' :
                                      c.urgency === Urgency.HIGH ? 'bg-orange-100 text-orange-800' :
                                      c.urgency === Urgency.MEDIUM ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-green-100 text-green-800'}`}>
                                    {c.urgency}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    {c.status === CaseStatus.NEW && <div className="h-2 w-2 rounded-full bg-blue-500"></div>}
                                    {c.status === CaseStatus.SENT && <div className="h-2 w-2 rounded-full bg-green-500"></div>}
                                    {c.status === CaseStatus.PENDING_APPROVAL && <div className="h-2 w-2 rounded-full bg-yellow-500"></div>}
                                    {c.status === CaseStatus.DRAFTING && <div className="h-2 w-2 rounded-full bg-indigo-500"></div>}
                                    {c.status === CaseStatus.APPROVED && <div className="h-2 w-2 rounded-full bg-emerald-500"></div>}
                                    <span className="text-sm text-gray-700">{c.status}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <button 
                                    onClick={() => setSelectedCase(c)}
                                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                                >
                                    {userRole === 'mp' && c.status === CaseStatus.PENDING_APPROVAL ? 'Review' : 'Manage'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {filteredCases.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                    No cases found matching these filters.
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
