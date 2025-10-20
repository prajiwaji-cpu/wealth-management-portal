// WealthPortalIntegrated.tsx
// Main component that integrates with HiSAFE API

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Upload, X, CheckCircle, FileText } from 'lucide-react';
import * as API from './WealthPortalApiClient';

export default function WealthPortalIntegrated() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [tasks, setTasks] = useState<API.ListResult[]>([]);
  const [selectedTask, setSelectedTask] = useState<API.ListResult | null>(null);
  const [taskMetadata, setTaskMetadata] = useState<API.TaskMetadata | null>(null);
  const [verificationMethod, setVerificationMethod] = useState('');
  const [formData, setFormData] = useState({
    annualRevenue: '',
    fiscalYearEnd: '',
    currentNetWorth: '',
    financialStatementDate: '',
    financialStatementsFile: null as File | null,
    cpaLetterFile: null as File | null,
    financialStatementsBlobId: '',
    cpaLetterBlobId: '',
    certificationChecked: false,
    signatureData: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signatureRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const abortControllerRef = useRef<AbortController>(new AbortController());

  // Check authentication on mount
  useEffect(() => {
    const controller = new AbortController();
    
    async function checkAuth() {
      try {
        const result = await API.testAuth(controller.signal);
        if (result === null) {
          // Not authenticated, redirect to login
          window.location.href = await API.getAuthorizeUrl();
        } else {
          setIsAuthenticating(false);
          loadTasks(controller.signal);
        }
      } catch (e) {
        console.error("Auth check failed:", e);
        setIsAuthenticating(false);
      }
    }
    
    checkAuth();
    
    return () => controller.abort();
  }, []);

  const loadTasks = async (signal: AbortSignal) => {
  try {
    setIsLoading(true);
    
    // First, get portal metadata to find series IDs
    const metadata = await API.getPortalMetadata(signal);
    
    // Find all list components (these are task lists)
    const listComponents = metadata.dashboardComponents.filter(c => c.type === 'list');
    
    if (listComponents.length === 0) {
      console.error("No list components found in portal");
      setIsLoading(false);
      return;
    }
    
    // Get series IDs from all list components
    const seriesIds = listComponents.flatMap(component => 
      component.series.map(s => s.id)
    );
    
    if (seriesIds.length === 0) {
      console.error("No series IDs found");
      setIsLoading(false);
      return;
    }
    
    // Load data for all series
    const data = await API.getPortalData(signal, seriesIds);
    
    // Combine tasks from all series
    const allTasks: API.ListResult[] = [];
    for (const seriesId of seriesIds) {
      const seriesData = data[seriesId];
      if (seriesData && seriesData.type === 'list') {
        allTasks.push(...seriesData.listResult);
      }
    }
    
    setTasks(allTasks);
    setIsLoading(false);
  } catch (e) {
    console.error("Failed to load tasks:", e);
    setIsLoading(false);
  }
};

  const selectTask = async (task: API.ListResult) => {
    try {
      setIsLoading(true);
      const metadata = await API.getTaskData(abortControllerRef.current.signal, task.task_id);
      setTaskMetadata(metadata);
      setSelectedTask(task);
      
      // Pre-populate form with existing data if available
      if (metadata.initialState) {
        const state = metadata.initialState as any;
        setFormData(prev => ({
          ...prev,
          annualRevenue: state.annual_revenue || '',
          fiscalYearEnd: state.fiscal_year_end || '',
          currentNetWorth: state.current_net_worth || '',
          financialStatementDate: state.financial_statement_date || '',
          certificationChecked: state.certification_checked || false
        }));
        
        if (state.verification_method) {
          setVerificationMethod(state.verification_method);
        }
      }
      
      setIsLoading(false);
    } catch (e) {
      console.error("Failed to load task:", e);
      alert("Failed to load task details. Please try again.");
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (field: 'financialStatements' | 'cpaLetter', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Upload file and get blob ID
      const blobId = await API.uploadFile(abortControllerRef.current.signal, file);
      
      if (field === 'financialStatements') {
        setFormData(prev => ({ 
          ...prev, 
          financialStatementsFile: file,
          financialStatementsBlobId: blobId
        }));
        setErrors(prev => ({ ...prev, financialStatements: '' }));
      } else {
        setFormData(prev => ({ 
          ...prev, 
          cpaLetterFile: file,
          cpaLetterBlobId: blobId
        }));
        setErrors(prev => ({ ...prev, cpaLetter: '' }));
      }
    } catch (e) {
      console.error("File upload failed:", e);
      alert("File upload failed. Please try again.");
    }
  };

  const removeFile = (field: 'financialStatements' | 'cpaLetter') => {
    if (field === 'financialStatements') {
      setFormData(prev => ({ 
        ...prev, 
        financialStatementsFile: null,
        financialStatementsBlobId: ''
      }));
    } else {
      setFormData(prev => ({ 
        ...prev, 
        cpaLetterFile: null,
        cpaLetterBlobId: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!verificationMethod) {
      newErrors.verificationMethod = 'Please select a verification method';
    }

    if (verificationMethod === 'A') {
      if (!formData.annualRevenue) newErrors.annualRevenue = 'Annual revenue is required';
      if (!formData.fiscalYearEnd) newErrors.fiscalYearEnd = 'Fiscal year end is required';
    }

    if (verificationMethod === 'B') {
      if (!formData.currentNetWorth) newErrors.currentNetWorth = 'Current net worth is required';
    }

    if (!formData.financialStatementDate) {
      newErrors.financialStatementDate = 'Financial statement date is required';
    }

    if (!formData.financialStatementsBlobId) {
      newErrors.financialStatements = 'Financial statements are required';
    }

    if (!formData.cpaLetterBlobId) {
      newErrors.cpaLetter = 'CPA certification letter is required';
    }

    if (!formData.certificationChecked) {
      newErrors.certificationChecked = 'You must certify the information is correct';
    }

    if (!formData.signatureData) {
      newErrors.signature = 'Signature is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !selectedTask || !taskMetadata) return;

    try {
      setIsSubmitting(true);

      // Prepare field data to submit
      // Note: Field names must match your HiSAFE form field names
      const fields: Record<string, any> = {
        verification_method: verificationMethod,
        financial_statement_date: formData.financialStatementDate,
        financial_statements: formData.financialStatementsBlobId,
        cpa_certification_letter: formData.cpaLetterBlobId,
        certification_checked: formData.certificationChecked,
        signature: formData.signatureData
      };

      if (verificationMethod === 'A') {
        fields.annual_revenue = formData.annualRevenue;
        fields.fiscal_year_end = formData.fiscalYearEnd;
      } else {
        fields.current_net_worth = formData.currentNetWorth;
      }

      await API.editTaskData(
        abortControllerRef.current.signal,
        selectedTask.task_id,
        taskMetadata.editSessionToken,
        fields
      );

      alert('Verification submitted successfully!');
      setSelectedTask(null);
      loadTasks(abortControllerRef.current.signal);
    } catch (e) {
      console.error("Submission failed:", e);
      alert("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = signatureRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = signatureRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Save signature as base64
    setFormData(prev => ({ ...prev, signatureData: canvas.toDataURL() }));
    setErrors(prev => ({ ...prev, signature: '' }));
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = signatureRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFormData(prev => ({ ...prev, signatureData: '' }));
  };

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-blue-600 text-xl">Authenticating...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-blue-600 text-xl">Loading your verification tasks...</div>
      </div>
    );
  }

  if (!selectedTask) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="bg-blue-900 text-white py-6 shadow-lg">
          <div className="max-w-6xl mx-auto px-6">
            <h1 className="text-3xl font-bold">Fund Member Portal</h1>
            <p className="text-blue-200 mt-1">Annual Verification Requirements</p>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Pending Verifications</h2>
            {tasks.length === 0 ? (
              <p className="text-gray-600">No pending verification tasks.</p>
            ) : (
              <div className="space-y-3">
                {tasks.map(task => (
                  <div
                    key={task.task_id}
                    onClick={() => selectTask(task)}
                    className="border border-blue-200 rounded-lg p-4 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">
                          Task #{task.task_id}
                        </h3>
                        {task.fields.status && (
                          <p className="text-sm text-gray-500 mt-1">
                            Status: {task.fields.status.name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center text-blue-600">
                        <span className="text-sm font-medium mr-2">Complete Verification</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render the form (same as before, just with integrated API)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="bg-blue-900 text-white py-6 shadow-lg">
        <div className="max-w-4xl mx-auto px-6">
          <button
            onClick={() => setSelectedTask(null)}
            className="text-blue-200 hover:text-white mb-4 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Tasks
          </button>
          <h1 className="text-3xl font-bold">Annual Fund Member Verification</h1>
          <p className="text-blue-200 mt-1">Please complete all required fields below</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Rest of the form JSX stays the same */}
          {/* ... (include all form fields from previous component) ... */}
          
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-lg transition-colors flex items-center"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              {isSubmitting ? 'Submitting...' : 'Submit Verification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
