import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
  const API_BASE = process.env.REACT_APP_API_BASE;

const PRApplications = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [jobsRes, appsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/job-drives/pr-jobs`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE}/api/job-drives/pr-applications`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setJobs(jobsRes.data.jobs || []);
      setApplications(appsRes.data.applications || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const filteredApplications = applications.filter(app => 
    selectedJob === 'all' || app.jobDrive._id === selectedJob
  );

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Job Applications</h1>
        <p className="text-gray-600">View and manage applications for your job postings</p>
      </div>

      {/* Job Filter */}
      <div className="mb-6">
        <select
          value={selectedJob}
          onChange={(e) => setSelectedJob(e.target.value)}
          className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Jobs ({applications.length})</option>
          {jobs.map(job => (
            <option key={job._id} value={job._id}>
              {job.role} - {job.companyName} ({applications.filter(app => app.jobDrive._id === job._id).length})
            </option>
          ))}
        </select>
      </div>

      {/* Applications List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {filteredApplications.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900">No applications found</h3>
            <p className="text-gray-500">Applications will appear here once students apply to your jobs.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredApplications.map((application) => (
              <li key={application._id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">
                        {application.student.profile?.name || application.student.email}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        application.status === 'applied' ? 'bg-blue-100 text-blue-800' :
                        application.status === 'shortlisted' ? 'bg-green-100 text-green-800' :
                        application.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {application.status}
                      </span>
                    </div>
                    <p className="text-gray-600">
                      Applied for: {application.jobDrive.role} at {application.jobDrive.companyName}
                    </p>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                      <span>📧 {application.student.email}</span>
                      <span>🎓 {application.student.profile?.department}</span>
                      <span>📊 CGPA: {application.student.profile?.cgpa}</span>
                      <span>📅 Applied: {new Date(application.appliedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => window.open(`${API_BASE}/api/profile/resume/${application.student.profile?.resume}`, '_blank')}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      disabled={!application.student.profile?.resume}
                    >
                      View Resume
                    </button>
                    <button
                      onClick={() => {/* Handle shortlist */}}
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      Shortlist
                    </button>
                    <button
                      onClick={() => {/* Handle reject */}}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PRApplications;