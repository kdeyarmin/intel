import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '../components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Bot, UserPlus, TrendingUp, Users, Loader2, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProjectManagement() {
  const queryClient = useQueryClient();
  const [activeAITab, setActiveAITab] = useState('assign');

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['campaignTasks'],
    queryFn: () => base44.entities.CampaignTask.list(),
  });

  const analyzeMutation = useMutation({
    mutationFn: (action) => base44.functions.invoke('aiProjectAnalysis', { action }),
    onSuccess: (data, variables) => {
      if (variables === 'assign') toast.success('Tasks analyzed for assignment');
      if (variables === 'analyze') toast.success('Timeline analysis complete');
      if (variables === 'resource') toast.success('Resource allocation optimized');
    },
    onError: (error) => {
      toast.error(`AI Analysis failed: ${error.message}`);
    }
  });

  const handleApplyAll = async (assignments) => {
    for (const a of assignments) {
      if (a.taskId && a.assigneeEmail) {
        await base44.entities.CampaignTask.update(a.taskId, { assigned_to: a.assigneeEmail });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['campaignTasks'] });
    toast.success('Applied all AI task assignments');
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'medium': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'low': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader 
        title="AI Project Management" 
        subtitle="Manage campaign tasks and optimize resources with AI"
        icon={Bot}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Tasks */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-[#0b1120] border-slate-800/60">
            <CardHeader className="pb-3 border-b border-slate-800/60 flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-white font-medium flex items-center gap-2">
                <Calendar className="w-5 h-5 text-cyan-400" />
                Current Tasks
              </CardTitle>
              <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-300">
                {tasks.length} Total
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loadingTasks ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No tasks found. Create campaign tasks to manage them here.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                  {tasks.map(task => (
                    <div key={task.id} className="p-4 hover:bg-slate-800/20 transition-colors flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{task.title}</span>
                          <Badge variant="outline" className={`text-[10px] uppercase h-5 ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </Badge>
                          {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="capitalize">{task.type}</span>
                          {task.due_date && <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400 mb-1">Assignee</p>
                        <p className="text-sm text-slate-200">{task.assigned_to || <span className="text-slate-500 italic">Unassigned</span>}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: AI Assistant */}
        <div className="space-y-4">
          <Card className="bg-[#0b1120] border-slate-800/60 sticky top-6">
            <CardHeader className="pb-3 border-b border-slate-800/60">
              <CardTitle className="text-lg text-white font-medium flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-400" />
                AI Project Assistant
              </CardTitle>
              <CardDescription className="text-slate-400">
                Enhance your project management with AI insights
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <Tabs value={activeAITab} onValueChange={setActiveAITab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-slate-900 border border-slate-800/60 h-auto p-1">
                  <TabsTrigger value="assign" className="py-2 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-cyan-400">
                    <UserPlus className="w-4 h-4 mb-1 mx-auto" />
                    Assign
                  </TabsTrigger>
                  <TabsTrigger value="analyze" className="py-2 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-purple-400">
                    <TrendingUp className="w-4 h-4 mb-1 mx-auto" />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="resource" className="py-2 text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400">
                    <Users className="w-4 h-4 mb-1 mx-auto" />
                    Resources
                  </TabsTrigger>
                </TabsList>

                {/* Assign Tab */}
                <TabsContent value="assign" className="mt-4 space-y-4">
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Automatically distribute tasks based on team member roles, availability, and task priority.
                  </p>
                  <Button 
                    className="w-full bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20"
                    onClick={() => analyzeMutation.mutate('assign')}
                    disabled={analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending && analyzeMutation.variables === 'assign' ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                    ) : (
                      <><UserPlus className="w-4 h-4 mr-2" /> Generate Assignments</>
                    )}
                  </Button>

                  {analyzeMutation.data?.data?.assignments && (
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-slate-200">Suggested Assignments</h4>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
                          onClick={() => handleApplyAll(analyzeMutation.data.data.assignments)}
                        >
                          Apply All
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {analyzeMutation.data.data.assignments.length === 0 ? (
                           <p className="text-xs text-slate-500 text-center py-2">No assignments needed.</p>
                        ) : (
                          analyzeMutation.data.data.assignments.map((a, i) => {
                            const task = tasks.find(t => t.id === a.taskId);
                            return (
                              <div key={i} className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-sm">
                                <p className="font-medium text-slate-200 truncate">{task?.title || 'Unknown Task'}</p>
                                <p className="text-xs text-cyan-400 mt-1">→ {a.assigneeEmail}</p>
                                <p className="text-[11px] text-slate-500 mt-2 italic">{a.reason}</p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Analyze Tab */}
                <TabsContent value="analyze" className="mt-4 space-y-4">
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Predict timelines, identify potential bottlenecks, and assess overall project risk.
                  </p>
                  <Button 
                    className="w-full bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20"
                    onClick={() => analyzeMutation.mutate('analyze')}
                    disabled={analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending && analyzeMutation.variables === 'analyze' ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                    ) : (
                      <><TrendingUp className="w-4 h-4 mr-2" /> Predict Timelines</>
                    )}
                  </Button>

                  {analyzeMutation.data?.data?.analysis && (
                    <div className="space-y-4 mt-4">
                      <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-slate-400">Risk Level</span>
                          <Badge variant="outline" className={`
                            ${analyzeMutation.data.data.riskLevel === 'High' ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}
                            ${analyzeMutation.data.data.riskLevel === 'Medium' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : ''}
                            ${analyzeMutation.data.data.riskLevel === 'Low' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}
                          `}>
                            {analyzeMutation.data.data.riskLevel}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">{analyzeMutation.data.data.analysis}</p>
                        
                        {analyzeMutation.data.data.estimatedCompletion && (
                          <div className="mt-3 pt-3 border-t border-slate-800">
                            <span className="text-xs text-slate-500">Est. Completion: </span>
                            <span className="text-sm font-medium text-purple-400">{analyzeMutation.data.data.estimatedCompletion}</span>
                          </div>
                        )}
                      </div>

                      {analyzeMutation.data.data.bottlenecks?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 text-orange-500" /> Potential Bottlenecks
                          </h4>
                          <ul className="space-y-1.5">
                            {analyzeMutation.data.data.bottlenecks.map((b, i) => (
                              <li key={i} className="text-xs text-slate-400 bg-slate-900 p-2 rounded border border-slate-800/60 flex gap-2">
                                <span className="text-orange-500">•</span> {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Resource Tab */}
                <TabsContent value="resource" className="mt-4 space-y-4">
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Intelligent resource allocation recommendations to balance workloads and optimize delivery.
                  </p>
                  <Button 
                    className="w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                    onClick={() => analyzeMutation.mutate('resource')}
                    disabled={analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending && analyzeMutation.variables === 'resource' ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                    ) : (
                      <><Users className="w-4 h-4 mr-2" /> Optimize Resources</>
                    )}
                  </Button>

                  {analyzeMutation.data?.data?.recommendations && (
                    <div className="space-y-4 mt-4 max-h-[400px] overflow-y-auto pr-1">
                      <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                        <h4 className="text-xs font-medium text-slate-400 mb-1.5">Strategy</h4>
                        <p className="text-sm text-emerald-300 leading-relaxed">{analyzeMutation.data.data.optimizationStrategy}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-lg">
                          <h4 className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">Overloaded</h4>
                          <div className="space-y-1">
                            {analyzeMutation.data.data.overloadedMembers?.length > 0 ? 
                              analyzeMutation.data.data.overloadedMembers.map((m, i) => <p key={i} className="text-xs text-slate-300 truncate" title={m}>{m}</p>) :
                              <p className="text-xs text-slate-500">None</p>
                            }
                          </div>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-lg">
                          <h4 className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Underutilized</h4>
                          <div className="space-y-1">
                            {analyzeMutation.data.data.underutilizedMembers?.length > 0 ? 
                              analyzeMutation.data.data.underutilizedMembers.map((m, i) => <p key={i} className="text-xs text-slate-300 truncate" title={m}>{m}</p>) :
                              <p className="text-xs text-slate-500">None</p>
                            }
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-slate-200 mb-2">Key Recommendations</h4>
                        <ul className="space-y-2">
                          {analyzeMutation.data.data.recommendations.map((r, i) => (
                            <li key={i} className="text-xs text-slate-400 bg-slate-900 p-2.5 rounded border border-slate-800/60">
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </TabsContent>

              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
