import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Menu, X, LayoutDashboard, Upload, Users, ListCheck, FileText, Settings, Shield, LogOut, BarChart3, MapPin, Activity, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppLayout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to load user', error);
      }
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const navigation = [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ['admin', 'sales_rep'] },
    { name: 'Data Imports', icon: Upload, page: 'DataImports', roles: ['admin'] },
    { name: 'Import Monitoring', icon: LayoutDashboard, page: 'ImportMonitoring', roles: ['admin'] },
    { name: 'Error Reports', icon: Shield, page: 'ErrorReports', roles: ['admin'] },
    { name: 'Auto Imports', icon: FileText, page: 'AutoImports', roles: ['admin'] },
    { name: 'Import Schedules', icon: Settings, page: 'ImportSchedule', roles: ['admin'] },
    { name: 'Providers', icon: Users, page: 'Providers', roles: ['admin', 'sales_rep'] },
    { name: 'Locations', icon: MapPin, page: 'Locations', roles: ['admin', 'sales_rep'] },
    { name: 'Utilization', icon: Activity, page: 'Utilization', roles: ['admin', 'sales_rep'] },
    { name: 'Referrals', icon: GitBranch, page: 'Referrals', roles: ['admin', 'sales_rep'] },
    { name: 'Lead Lists', icon: ListCheck, page: 'LeadLists', roles: ['admin', 'sales_rep'] },
    { name: 'Analytics', icon: BarChart3, page: 'Analytics', roles: ['admin'] },
    { name: 'Scoring Rules', icon: Settings, page: 'ScoringRules', roles: ['admin'] },
    { name: 'Audit Log', icon: Shield, page: 'AuditLog', roles: ['admin', 'sales_rep'] },
  ];

  const filteredNav = navigation.filter(item => 
    item.roles.includes(user?.role)
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-gradient-to-b from-blue-600 to-blue-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h1 className="text-xl font-bold">CareMetric</h1>
              <p className="text-xs text-teal-100">Provider Intel</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-blue-500"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.page)}
                className={`flex items-center px-3 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-900 text-white'
                    : 'text-blue-50 hover:bg-blue-500'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="ml-3 font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-blue-500">
          {user && sidebarOpen && (
            <div className="mb-3">
              <p className="text-sm font-medium text-white">{user.full_name || user.email}</p>
              <p className="text-xs text-blue-200 capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => base44.auth.logout()}
            className="w-full text-white hover:bg-blue-500 justify-start"
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="ml-3">Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-blue-50 flex flex-col">
        <div className="flex-1">
          {children}
        </div>
        <div className="px-8 py-4 border-t border-gray-200 bg-white/60">
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            <strong>Data Sources:</strong> All data is derived from publicly available CMS Medicare datasets and NPPES National Provider files. Insights are estimates based on public data patterns and do not represent confirmed referral relationships. Small cell counts (&lt;11) are suppressed for privacy compliance.
          </p>
        </div>
      </main>
    </div>
  );
}