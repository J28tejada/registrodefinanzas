'use client';

import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
          F
        </div>
        <div>
          <p className="font-bold text-white text-lg leading-tight">FinanzasIA</p>
          <p className="text-slate-400 text-xs">Control financiero inteligente</p>
        </div>
      </div>
      <SignUp
        appearance={{
          variables: {
            colorBackground: '#0f172a',
            colorInputBackground: '#1e293b',
            colorInputText: '#f1f5f9',
            colorText: '#f1f5f9',
            colorTextSecondary: '#94a3b8',
            colorPrimary: '#10b981',
            colorDanger: '#f43f5e',
            borderRadius: '0.75rem',
            fontFamily: 'inherit',
          },
          elements: {
            card: 'bg-slate-900 border border-slate-800 shadow-xl',
            headerTitle: 'text-white',
            headerSubtitle: 'text-slate-400',
            socialButtonsBlockButton: 'border-slate-700 text-slate-300 hover:bg-slate-800',
            dividerLine: 'bg-slate-700',
            dividerText: 'text-slate-500',
            formFieldLabel: 'text-slate-400',
            footerActionLink: 'text-emerald-400 hover:text-emerald-300',
          },
        }}
      />
    </div>
  );
}
