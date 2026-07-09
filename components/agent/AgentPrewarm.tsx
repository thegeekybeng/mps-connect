'use client';
import { useEffect } from 'react';
import { prewarmAgentModel } from '@/app/actions/agent';

export default function AgentPrewarm() {
  useEffect(() => {
    prewarmAgentModel().catch(() => {});
  }, []);
  return null;
}
