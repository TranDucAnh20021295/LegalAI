'use client';

export default function DashboardLayout({ children }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        minWidth: '100vw',
        minHeight: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        zIndex: 9998,
      }}
    >
      {children}
    </div>
  );
}
