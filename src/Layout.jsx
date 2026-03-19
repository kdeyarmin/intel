import React from 'react';
import AppLayout from './components/layout/AppLayout.jsx';

export default function Layout({ children, currentPageName }) {
  return (
    <AppLayout currentPageName={currentPageName}>
      {children}
    </AppLayout>
  );
}