import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Eye,
  MessageSquare,
  Plus
} from 'lucide-react';

export default function ErrorReports() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [newReport, setNewReport] = useState({
    title: '',
    description: '',
    severity: 'medium',
  });

  const queryClient = useQueryClient();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['errorReports'],
    queryFn: () => base44.entities.ErrorReport.list('-created_date', 100),
  });

  const createReportMutation = useMutation({
    mutationFn: async (reportData) => {
      return base44.entities.ErrorReport.create({
        error_type: 'user_reported',
        status: 'new',
        ...reportData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['errorReports']);
      setReportDialogOpen(false);
      setNewReport({ title: '', description: '', severity: 'medium' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, resolution_notes }) => {
      const user = await base44.auth.me();
      return base44.entities.ErrorReport.update(id, {
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : undefined,
        resolved_by: status === 'resolved' ? user.email : undefined,
        resolution_notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['errorReports']);
    },
  });

  const getSeverityBadge = (severity) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800',
    };
    return <Badge className={colors[severity]}>{severity}</Badge>;
  };

  const getStatusBadge = (status) => {
    const colors = {
      new: 'bg-red-100 text-red-800',
      investigating: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
      dismissed: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[status]}>{status}</Badge>;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'new':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'investigating':
        return <Eye className="w-5 h-5 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'dismissed':
        return <XCircle className="w-5 h-5 text-gray-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const newReports = reports.filter(r => r.status === 'new');
  const investigatingReports = reports.filter(r => r.status === 'investigating');
  const resolvedReports = reports.filter(r => r.status === 'resolved');

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Error Reports</h1>
          <p className="text-gray-600 mt-1">Monitor and manage system errors and issues</p>
        </div>
        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Report Issue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report an Issue</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Issue Title</Label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Brief description of the issue"
                  value={newReport.title}
                  onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Severity</Label>
                <Select 
                  value={newReport.severity} 
                  onValueChange={(value) => setNewReport({ ...newReport, severity: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Detailed description of the issue..."
                  value={newReport.description}
                  onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                  rows={5}
                />
              </div>

              <Button
                onClick={() => createReportMutation.mutate(newReport)}
                disabled={!newReport.title || !newReport.description || createReportMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                Submit Report
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">New Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-red-600">{newReports.length}</div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Investigating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-yellow-600">{investigatingReports.length}</div>
              <Eye className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-green-600">{resolvedReports.length}</div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Reports List */}
      <Card>
        <CardHeader>
          <CardTitle>All Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading error reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No error reports</p>
              <p className="text-sm mt-1">All systems operating normally</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(report.status)}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{report.title}</h3>
                          {getSeverityBadge(report.severity)}
                        </div>
                        <p className="text-sm text-gray-600">{report.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(report.status)}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReport(report)}
                          >
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Error Report Details</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <h4 className="font-semibold mb-2">General Information</h4>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Type:</span>
                                  <p className="font-medium">{report.error_type}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Severity:</span>
                                  <p className="font-medium">{report.severity}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Status:</span>
                                  <p className="font-medium">{report.status}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Created:</span>
                                  <p className="font-medium">{new Date(report.created_date).toLocaleString()}</p>
                                </div>
                                {report.created_by && (
                                  <div>
                                    <span className="text-gray-600">Reported By:</span>
                                    <p className="font-medium">{report.created_by}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold mb-2">Description</h4>
                              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                                {report.description}
                              </p>
                            </div>

                            {report.error_samples && report.error_samples.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-2">Error Samples</h4>
                                <div className="bg-red-50 rounded-lg p-3 space-y-2">
                                  {report.error_samples.map((error, idx) => (
                                    <div key={idx} className="text-sm">
                                      <span className="font-medium text-red-700">Error {idx + 1}:</span>{' '}
                                      <span className="text-red-600">{error.message}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {report.context && (
                              <div>
                                <h4 className="font-semibold mb-2">Context</h4>
                                <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto">
                                  {JSON.stringify(report.context, null, 2)}
                                </pre>
                              </div>
                            )}

                            {report.status !== 'resolved' && report.status !== 'dismissed' && (
                              <div className="space-y-3">
                                <h4 className="font-semibold">Update Status</h4>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateStatusMutation.mutate({ 
                                      id: report.id, 
                                      status: 'investigating' 
                                    })}
                                  >
                                    Mark as Investigating
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600"
                                    onClick={() => {
                                      const notes = prompt('Resolution notes (optional):');
                                      updateStatusMutation.mutate({ 
                                        id: report.id, 
                                        status: 'resolved',
                                        resolution_notes: notes || undefined
                                      });
                                    }}
                                  >
                                    Mark as Resolved
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateStatusMutation.mutate({ 
                                      id: report.id, 
                                      status: 'dismissed' 
                                    })}
                                  >
                                    Dismiss
                                  </Button>
                                </div>
                              </div>
                            )}

                            {report.resolved_at && (
                              <div>
                                <h4 className="font-semibold mb-2">Resolution</h4>
                                <div className="text-sm space-y-1">
                                  <p><span className="text-gray-600">Resolved at:</span> {new Date(report.resolved_at).toLocaleString()}</p>
                                  {report.resolved_by && (
                                    <p><span className="text-gray-600">Resolved by:</span> {report.resolved_by}</p>
                                  )}
                                  {report.resolution_notes && (
                                    <p className="mt-2 bg-green-50 p-2 rounded">
                                      <span className="text-gray-600">Notes:</span> {report.resolution_notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>Type: {report.error_type}</span>
                    {report.source && <span>Source: {report.source}</span>}
                    <span className="ml-auto">{new Date(report.created_date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}