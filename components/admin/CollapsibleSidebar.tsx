/**
 * Admin sidebar (collapse/expand). Footer shows `APP_VERSION` from `@/lib/app-version` (package.json).
 */

'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_VERSION } from '@/lib/app-version';

interface CollapsibleSidebarProps {
  session: {
    user: {
      name?: string;
      email: string;
      role?: string;
    };
    appRole?: 'none' | 'user' | 'admin' | 'superadmin';
  };
  navigationAccess: {
    isGlobalAdmin: boolean;
    hasAnyPartnerAccess: boolean;
    hasEventsAccess: boolean;
    hasGymAccess: boolean;
  };
}

interface NavItem {
  href: string;
  icon: string;
  label: string;
  indent?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function CollapsibleSidebar({ session, navigationAccess }: CollapsibleSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const navSections: NavSection[] = [];
  const coreItems: NavItem[] = [];

  if (navigationAccess.isGlobalAdmin) {
    coreItems.push({ href: '/admin', icon: '📊', label: 'Dashboard' });
  }
  if (navigationAccess.hasAnyPartnerAccess) {
    coreItems.push({ href: '/admin/partners', icon: '🤝', label: 'Partners' });
  }
  if (navigationAccess.isGlobalAdmin) {
    coreItems.push({ href: '/admin/users', icon: '👥', label: 'Users' });
  }
  if (coreItems.length > 0) {
    navSections.push({ title: 'Core', items: coreItems });
  }

  if (navigationAccess.isGlobalAdmin) {
    navSections.push({
      title: 'Resource Inventory',
      items: [
        { href: '/admin/frames', icon: '🖼️', label: 'Global Frames' },
        { href: '/admin/logos', icon: '🎨', label: 'Global Logos' },
        { href: '/admin/submissions', icon: '📷', label: 'Global Galleries' },
      ],
    });
  }

  const appItems: NavItem[] = [];
  if (navigationAccess.hasEventsAccess) {
    appItems.push({ href: '/admin/events', icon: '🎯', label: 'Events App' });
  }
  if (navigationAccess.hasGymAccess) {
    appItems.push({ href: '/admin/gym', icon: '💪', label: 'Gym App' });
  }
  if (appItems.length > 0) {
    navSections.push({ title: 'Apps', items: appItems });
  }

  return (
    <>
      {/* Sidebar */}
      <aside 
        className={`${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 relative`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 z-10 w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="text-xs">{isCollapsed ? '→' : '←'}</span>
        </button>

        {/* Logo */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="https://i.ibb.co/zTG7ztxC/camera-logo.png" 
              alt="Camera Logo" 
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 flex-shrink-0"
            />
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Camera</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Admin Panel</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.title}>
              {!isCollapsed && (
                <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-gray-700 transition-colors dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        item.indent && !isCollapsed ? 'ml-4' : ''
                      } ${
                        isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : ''
                      }`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className="text-xl flex-shrink-0">{item.icon}</span>
                      {!isCollapsed && (
                        <span className={`font-medium ${item.indent ? 'text-sm' : ''}`}>{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Info & Version */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className={`${isCollapsed ? 'px-2' : 'px-4'} py-3 bg-gray-50 dark:bg-gray-900 rounded-lg`}>
            {!isCollapsed ? (
              <>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {session.user.name || session.user.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{session.appRole || 'user'}</p>
              </>
            ) : (
              <div className="text-center">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold mx-auto">
                  {(session.user.name || session.user.email).charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </div>
          
          {!isCollapsed && (
            <>
              <Link
                href="/"
                className="mt-2 flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                ← Back to App
              </Link>
              
              {/* Version Number */}
              <div className="mt-3 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-600 font-mono">
                  v{APP_VERSION}
                </p>
              </div>
            </>
          )}
          
          {isCollapsed && (
            <div className="mt-2 text-center">
              <p className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
                v{APP_VERSION}
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
