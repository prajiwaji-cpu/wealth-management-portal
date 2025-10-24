// FieldOptionsInspector.tsx - Shows actual option values for dropdowns/radios
// Temporarily replace WealthPortalIntegrated with this

import React, { useState, useEffect, useRef } from 'react';
import * as API from './WealthPortalApiClient';

export default function FieldOptionsInspector() {
  const [tasks, setTasks] = useState<API.ListResult[]>([]);
  const [selectedTask, setSelectedTask] = useState<API.ListResult | null>(null);
  const [taskMetadata, setTaskMetadata] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const abortControllerRef = useRef<AbortController>(new AbortController());

  useEffect(() => {
    loadTasks(abortControllerRef.current.signal);
  }, []);

  const loadTasks = async (signal: AbortSignal) => {
    try {
      const metadata = await API.getPortalMetadata(signal);
      const listComponents = metadata.dashboardComponents.filter(c => c.type === 'list');
      const seriesIds = listComponents.flatMap(component => component.series.map(s => s.id));
      const data = await API.getPortalData(signal, seriesIds);
      
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
      
      // Log everything to console too
      console.log("📋 TASK METADATA:", metadata);
      console.log("📝 FIELD NAMES AND OPTIONS:");
      metadata.layout.tabs.forEach((tab: any) => {
  console.log(`\n📁 Tab: ${tab.heading}`);
  tab.elements.forEach((element: any) => {
  if (element.elementType !== 'field' || !element.elementInfo) return;
  const field = element.elementInfo;
  console.log(`\n  🔹 Field: ${field.fieldName}`);
          console.log(`     Display Name: ${field.displayName}`);
          console.log(`     Type: ${field.displayType}`);
          console.log(`     Required: ${field.isRequired}`);
          if (field.options && field.options.length > 0) {
            console.log(`     OPTIONS:`);
            field.options.forEach((opt: any) => {
              console.log(`       - value: "${opt.value}" ${opt.isHeader ? '(HEADER)' : ''}`);
            });
          }
        });
      });
      
      setIsLoading(false);
    } catch (e) {
      console.error("Failed to load task:", e);
      setIsLoading(false);
    }
  };

  if (isLoading && !selectedTask) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading tasks...</div>
      </div>
    );
  }

  if (!selectedTask) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-blue-900 text-white p-6 rounded-lg mb-6">
            <h1 className="text-3xl font-bold mb-2">🔍 Field Options Inspector</h1>
            <p>Click a task to see the actual dropdown/radio values</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Select a Task</h2>
            {tasks.length === 0 ? (
              <p className="text-gray-600">No tasks found</p>
            ) : (
              <div className="space-y-2">
                {tasks.map(task => (
                  <button
                    key={task.task_id}
                    onClick={() => selectTask(task)}
                    className="w-full text-left p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-semibold">Task #{task.task_id}</div>
                    {task.fields.status && (
                      <div className="text-sm text-gray-600">Status: {task.fields.status.name}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading task metadata...</div>
      </div>
    );
  }

  if (!taskMetadata) return null;

  // Group fields by whether they have options
  const fieldsWithOptions: any[] = [];
  const otherFields: any[] = [];
  
taskmetadata.layout.tabs.forEach((tab: any) => {
  tab.elements.forEach((element: any) => {
    if (element.elementType !== 'field' || !element.elementInfo) return;
    const field = element.elementInfo;
      const fieldWithTab = { ...field, tabName: tab.heading };
      if (field.options && field.options.length > 0) {
        fieldsWithOptions.push(fieldWithTab);
      } else {
        otherFields.push(fieldWithTab);
      }
    });
  });

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => {
            setSelectedTask(null);
            setTaskMetadata(null);
          }}
          className="mb-4 text-blue-600 hover:underline flex items-center"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to tasks
        </button>

        <div className="bg-blue-900 text-white p-6 rounded-lg mb-6">
          <h1 className="text-2xl font-bold">Task #{selectedTask.task_id} - Field Analysis</h1>
          <p className="text-blue-200 mt-1">Here are the actual values you need to send to the API</p>
        </div>

        {/* Current Values */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-6">
          <h2 className="text-lg font-bold mb-2">📊 Current Field Values</h2>
          <div className="bg-white p-4 rounded mt-2 overflow-auto">
            <pre className="text-xs">{JSON.stringify(taskMetadata.initialState, null, 2)}</pre>
          </div>
        </div>

        {/* Fields with Options (Dropdowns/Radios) */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="bg-green-100 p-4 border-b">
            <h2 className="text-xl font-bold text-green-900">
              ✅ Fields with Options (Dropdowns/Radio Buttons)
            </h2>
            <p className="text-sm text-green-700 mt-1">
              These are the EXACT values you must send for dropdown/radio fields
            </p>
          </div>
          
          {fieldsWithOptions.length === 0 ? (
            <div className="p-6 text-gray-600">No dropdown or radio fields found</div>
          ) : (
            <div className="divide-y">
              {fieldsWithOptions.map((field, idx) => (
                <div key={idx} className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{field.tabName}</div>
                      <h3 className="text-lg font-bold text-gray-900">{field.displayName}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <code className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          fieldName: {field.fieldName}
                        </code>
                        <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                          {field.displayType}
                        </span>
                        {field.isRequired && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      Current: <code className="bg-gray-100 px-2 py-1 rounded">
                        {JSON.stringify(taskMetadata.initialState[field.fieldName]) || 'null'}
                      </code>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="font-semibold text-sm text-gray-700 mb-2">Available Options:</div>
                    <div className="bg-gray-50 p-4 rounded space-y-2">
                      {field.options.map((option: any, optIdx: number) => (
                        <div
                          key={optIdx}
                          className={`p-3 rounded ${
                            option.isHeader
                              ? 'bg-gray-200 font-bold'
                              : 'bg-white border border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <code className="text-sm font-mono text-blue-700">
                              "{option.value}"
                            </code>
                            {option.isHeader && (
                              <span className="text-xs bg-gray-400 text-white px-2 py-1 rounded">
                                HEADER (not selectable)
                              </span>
                            )}
                            {taskMetadata.initialState[field.fieldName] === option.value && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">
                                ← CURRENT VALUE
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Other Fields */}
        <div className="bg-white rounded-lg shadow">
          <div className="bg-gray-100 p-4 border-b">
            <h2 className="text-xl font-bold text-gray-900">📝 Other Fields (Text, Date, File, etc.)</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Tab</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Field Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Display Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Required</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">Current Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {otherFields.map((field, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600">{field.tabName}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-blue-50 text-blue-800 px-2 py-1 rounded">
                        {field.fieldName}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm">{field.displayName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                        {field.displayType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {field.isRequired ? (
                        <span className="text-xs text-red-600">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {JSON.stringify(taskMetadata.initialState[field.fieldName]) || 'null'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
