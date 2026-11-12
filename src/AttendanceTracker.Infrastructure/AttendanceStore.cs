using AttendanceTracker.Domain;

namespace AttendanceTracker.Infrastructure;

public sealed class AttendanceStore
{
    private readonly object _gate = new();
    private readonly List<Student> _students =
    [
        new("s-001", "Alex Morgan", "alex@student.attendance.local", "AM", "Human Computer Interaction"),
        new("s-002", "Jamie Chen", "jamie@student.attendance.local", "JC", "Human Computer Interaction"),
        new("s-003", "Sam Rivera", "sam@student.attendance.local", "SR", "Human Computer Interaction"),
        new("s-004", "Taylor Kim", "taylor@student.attendance.local", "TK", "Human Computer Interaction"),
        new("s-005", "Jordan Lee", "jordan@student.attendance.local", "JL", "Human Computer Interaction"),
        new("s-006", "Casey Brown", "casey@student.attendance.local", "CB", "Human Computer Interaction"),
        new("s-007", "Morgan Patel", "morgan@student.attendance.local", "MP", "Human Computer Interaction"),
        new("s-008", "Riley Davis", "riley@student.attendance.local", "RD", "Human Computer Interaction")
    ];
    private readonly List<ClassSession> _sessions = [];
    public IReadOnlyList<Student> Students => _students;

    public ClassSession StartSession()
    {
        lock (_gate)
        {
            foreach (var old in _sessions.Where(session => session.IsOpen)) old.IsOpen = false;
            var session = new ClassSession(Guid.NewGuid().ToString("N"), "Human Computer Interaction", "Studio 204", NewCode(), DateTimeOffset.UtcNow);
            _sessions.Insert(0, session);
            return session;
        }
    }

    public ClassSession? GetActiveSession()
    {
        lock (_gate) return _sessions.FirstOrDefault(session => session.IsOpen);
    }

    public ClassSession? GetSession(string id)
    {
        lock (_gate) return _sessions.FirstOrDefault(session => session.Id == id);
    }

    public bool CloseSession(string id)
    {
        lock (_gate)
        {
            var session = _sessions.FirstOrDefault(session => session.Id == id);
            if (session is null) return false;
            session.IsOpen = false;
            return true;
        }
    }

    public IReadOnlyList<ClassSession> GetSessions()
    {
        lock (_gate) return _sessions.ToArray();
    }

    public (bool Success, string Message, AttendanceEntry? Entry) CheckIn(string sessionId, string code, string studentId)
    {
        lock (_gate)
        {
            var session = _sessions.FirstOrDefault(item => item.Id == sessionId && item.IsOpen);
            if (session is null) return (false, "This check-in session has ended.", null);
            if (DateTimeOffset.UtcNow >= session.CodeExpiresAt || !string.Equals(session.Code, code, StringComparison.Ordinal)) return (false, "That code has expired. Ask your teacher to show the latest QR code.", null);
            var student = _students.FirstOrDefault(item => item.Id == studentId);
            if (student is null) return (false, "Student account was not found.", null);
            var existing = session.Entries.FirstOrDefault(entry => entry.StudentId == studentId);
            if (existing is not null) return (true, "You are already checked in.", existing);
            var entry = new AttendanceEntry(student.Id, student.Name, student.Initials, "Present", DateTimeOffset.UtcNow);
            session.Entries.Add(entry);
            return (true, "You're checked in. Have a great class!", entry);
        }
    }

    public ClassSession RefreshCode(string id)
    {
        lock (_gate)
        {
            var session = _sessions.FirstOrDefault(item => item.Id == id && item.IsOpen) ?? throw new InvalidOperationException("Session is no longer active.");
            session.Code = NewCode();
            session.CodeExpiresAt = DateTimeOffset.UtcNow.AddSeconds(60);
            return session;
        }
    }

    public IReadOnlyList<AttendanceEntry> GetEntries(string id)
    {
        lock (_gate) return _sessions.FirstOrDefault(session => session.Id == id)?.Entries.ToArray() ?? [];
    }

    private static string NewCode() => Random.Shared.Next(100000, 999999).ToString();
}
