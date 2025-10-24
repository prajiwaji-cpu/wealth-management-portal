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
    
    async function init() {
      try {
        setIsAuthenticating(false);
        loadTasks(controller.signal);
      } catch (e) {
        console.error("Initialization failed:", e);
        setIsAuthenticating(false);
      }
    }
    
    init();
    
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
          certificationChecked: state.Certify_Information || false
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
        Way_to_Verify: verificationMethod,
        Financial_Statement_Date: formData.financialStatementDate,
        Financial_Statements: formData.financialStatementsBlobId,
        CPA_Certification: formData.cpaLetterBlobId,
        Certify_Information: formData.certificationChecked,
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

  // Render the complete form with all fields
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
          {/* Verification Method Selection */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Select Verification Method</h2>
            <p className="text-gray-600 mb-4">
              Choose one of the following methods to verify your qualified purchaser status:
            </p>
            
            <div className="space-y-4">
              <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors"
                     style={{ borderColor: verificationMethod === 'A' ? '#1e40af' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="verificationMethod"
                  value="A"
                  checked={verificationMethod === 'A'}
                  onChange={(e) => {
                    setVerificationMethod(e.target.value);
                    setErrors(prev => ({ ...prev, verificationMethod: '' }));
                  }}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-semibold text-gray-800">Method A: Revenue & Assets</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Annual revenue exceeds $5,000,000 and assets exceed $25,000,000
                  </div>
                </div>
              </label>

              <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors"
                     style={{ borderColor: verificationMethod === 'B' ? '#1e40af' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="verificationMethod"
                  value="B"
                  checked={verificationMethod === 'B'}
                  onChange={(e) => {
                    setVerificationMethod(e.target.value);
                    setErrors(prev => ({ ...prev, verificationMethod: '' }));
                  }}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="font-semibold text-gray-800">Method B: Net Worth</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Net worth exceeds $25,000,000
                  </div>
                </div>
              </label>
            </div>
            {errors.verificationMethod && (
              <div className="flex items-center text-red-600 mt-2">
                <AlertCircle className="w-4 h-4 mr-2" />
                <span className="text-sm">{errors.verificationMethod}</span>
              </div>
            )}
          </div>

          {/* Method A Fields */}
          {verificationMethod === 'A' && (
            <div className="mb-8 p-6 bg-blue-50 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Method A: Financial Details</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Annual Revenue <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500">$</span>
                    <input
                      type="text"
                      value={formData.annualRevenue}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.]/g, '');
                        setFormData(prev => ({ ...prev, annualRevenue: value }));
                        setErrors(prev => ({ ...prev, annualRevenue: '' }));
                      }}
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="5,000,000"
                    />
                  </div>
                  {errors.annualRevenue && (
                    <div className="flex items-center text-red-600 mt-2">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      <span className="text-sm">{errors.annualRevenue}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fiscal Year End <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.fiscalYearEnd}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, fiscalYearEnd: e.target.value }));
                      setErrors(prev => ({ ...prev, fiscalYearEnd: '' }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {errors.fiscalYearEnd && (
                    <div className="flex items-center text-red-600 mt-2">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      <span className="text-sm">{errors.fiscalYearEnd}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Method B Fields */}
          {verificationMethod === 'B' && (
            <div className="mb-8 p-6 bg-blue-50 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Method B: Net Worth</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Net Worth <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-500">$</span>
                  <input
                    type="text"
                    value={formData.currentNetWorth}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      setFormData(prev => ({ ...prev, currentNetWorth: value }));
                      setErrors(prev => ({ ...prev, currentNetWorth: '' }));
                    }}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="25,000,000"
                  />
                </div>
                {errors.currentNetWorth && (
                  <div className="flex items-center text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">{errors.currentNetWorth}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial Statement Date */}
          {verificationMethod && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Supporting Documentation</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Financial Statement Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.financialStatementDate}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, financialStatementDate: e.target.value }));
                    setErrors(prev => ({ ...prev, financialStatementDate: '' }));
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Date of the financial statements you're uploading
                </p>
                {errors.financialStatementDate && (
                  <div className="flex items-center text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">{errors.financialStatementDate}</span>
                  </div>
                )}
              </div>

              {/* Financial Statements Upload */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Financial Statements <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Upload your audited or reviewed financial statements
                </p>
                
                {!formData.financialStatementsFile ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600">Click to upload financial statements</span>
                    <span className="text-xs text-gray-500 mt-1">PDF, DOC, or DOCX</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => handleFileUpload('financialStatements', e)}
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-green-600 mr-3" />
                      <div>
                        <div className="font-medium text-gray-800">{formData.financialStatementsFile.name}</div>
                        <div className="text-sm text-gray-500">
                          {(formData.financialStatementsFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile('financialStatements')}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
                {errors.financialStatements && (
                  <div className="flex items-center text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">{errors.financialStatements}</span>
                  </div>
                )}
              </div>

              {/* CPA Letter Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CPA Certification Letter <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Upload a letter from your CPA certifying the information
                </p>
                
                {!formData.cpaLetterFile ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600">Click to upload CPA letter</span>
                    <span className="text-xs text-gray-500 mt-1">PDF, DOC, or DOCX</span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => handleFileUpload('cpaLetter', e)}
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-green-600 mr-3" />
                      <div>
                        <div className="font-medium text-gray-800">{formData.cpaLetterFile.name}</div>
                        <div className="text-sm text-gray-500">
                          {(formData.cpaLetterFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile('cpaLetter')}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
                {errors.cpaLetter && (
                  <div className="flex items-center text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">{errors.cpaLetter}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Certification & Signature */}
          {verificationMethod && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Certification & Signature</h3>
              
              <div className="mb-6">
                <label className="flex items-start p-4 bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.certificationChecked}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, certificationChecked: e.target.checked }));
                      setErrors(prev => ({ ...prev, certificationChecked: '' }));
                    }}
                    className="mt-1 mr-3"
                  />
                  <div className="text-sm text-gray-700">
                    I certify that the information provided above is true and accurate to the best of my knowledge. 
                    I understand that providing false information may result in legal consequences and immediate 
                    termination of my fund membership.
                  </div>
                </label>
                {errors.certificationChecked && (
                  <div className="flex items-center text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">{errors.certificationChecked}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Signature <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Please sign in the box below
                </p>
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <canvas
                    ref={signatureRef}
                    width={600}
                    height={200}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    className="w-full cursor-crosshair bg-white"
                  />
                </div>
                <button
                  onClick={clearSignature}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Clear Signature
                </button>
                {errors.signature && (
                  <div className="flex items-center text-red-600 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span className="text-sm">{errors.signature}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !verificationMethod}
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
