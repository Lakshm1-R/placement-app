          {user?.role === 'student' && (
            <Link to="/job-drives" className="nav-link">
              Job Drives
            </Link>
          )}

          {user?.role === 'po' && (
            <>
              <Link to="/manage-drives" className="nav-link">
                Manage Drives
              </Link>
              <Link to="/pr-create-job" className="nav-link">
                Create Drive
              </Link>
            </>
          )}


