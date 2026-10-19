import { useState, FormEvent } from 'react';
import { api } from '../../services/api';
import { CreateGroupResponse } from '../../types/group';

interface Props {
  onSuccess: (data: CreateGroupResponse) => void;
  onError: (error: string) => void;
  isLoading: boolean;
}

export function CreateGroupForm({ onSuccess, onError, isLoading }: Props) {
  const [groupName, setGroupName] = useState('');
  const [maxMembers, setMaxMembers] = useState(4);
  const [fieldErrors, setFieldErrors] = useState<{ groupName?: string }>({});

  const validate = (): boolean => {
    const errors: { groupName?: string } = {};
    if (!groupName.trim()) {
      errors.groupName = 'Group name is required';
    } else if (groupName.length > 255) {
      errors.groupName = 'Group name must be 255 characters or less';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const result = await api.createGroup({
        group_name: groupName.trim(),
        max_members: maxMembers,
      });
      onSuccess(result);
    } catch (error: any) {
      onError(error.response?.data?.error ?? error.message ?? 'Failed to create group. Please try again.');
    }
  };

  return (
    <form className="create-group-form" onSubmit={handleSubmit}>
      <div className="cv-form-group">
        <label className="cv-label" htmlFor="groupName">Group Name</label>
        <input
          id="groupName"
          type="text"
          className="cv-input"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Movie Night Crew"
          maxLength={255}
          disabled={isLoading}
        />
        {fieldErrors.groupName && (
          <span className="error-message">{fieldErrors.groupName}</span>
        )}
      </div>

      <div className="cv-form-group">
        <label className="cv-label" htmlFor="maxMembers">Number of Members</label>
        <select
          id="maxMembers"
          className="cv-input"
          value={maxMembers}
          onChange={(e) => setMaxMembers(Number(e.target.value))}
          disabled={isLoading}
        >
          {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>{n} people</option>
          ))}
        </select>
      </div>

      <button type="submit" className="cv-btn cv-btn--primary cv-btn--full" disabled={isLoading}>
        {isLoading ? 'Creating…' : 'Create Group'}
      </button>
    </form>
  );
}
