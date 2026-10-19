import { useState } from 'react';
import { CreateGroupForm } from './CreateGroupForm';
import { CreateGroupSuccess } from './CreateGroupSuccess';
import { CreateGroupResponse } from '../../types/group';
import { PageWrapper } from '../../components/PageWrapper';
import './CreateGroup.css';

export function CreateGroupPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<CreateGroupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = (data: CreateGroupResponse) => {
    setResult(data);
    setStatus('success');
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setStatus('error');
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  return (
    <PageWrapper>
      <div className="create-group-page">
        {status !== 'success' && (
          <>
            <h1>Create a Group</h1>
            <p className="page-subtitle">Set up a session and invite friends to vote on movies.</p>
          </>
        )}

        {(status === 'idle' || status === 'loading' || status === 'error') && (
          <div className="create-group-form-card">
            <CreateGroupForm
              onSuccess={handleSuccess}
              onError={handleError}
              isLoading={status === 'loading'}
            />
          </div>
        )}

        {status === 'success' && result && (
          <CreateGroupSuccess data={result} onReset={handleReset} />
        )}

        {status === 'error' && error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={handleReset}>Try Again</button>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
