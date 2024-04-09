import project from '../helpers/github-projects.mjs';

const handleIssueEvent = (payload) => {
  console.log('New Issue Action on repository:', payload.repository.full_name);

  //Issue opened, edited, deleted, transferred, pinned, unpinned, closed, reopened, assigned, unassigned, labeled, unlabeled, milestoned, demilestoned, locked, or unlocked.

  switch (payload.action) {
    case 'opened':
      console.log('Issue opened');
      // multiple events will be called for the same issue
      // unsure if we need to call this but race issue will be here.
      // right now the strategy is just call this a lot... but it's not a good strategy.
      project.updateIssueStatus(payload.issue.node_id);
      break;
    case 'assigned':
      console.log('Issue assigned');
      console.log(payload.issue.assignee); // can there be more than one?
      project.updateIssueStatus(payload.issue.node_id);
      break;
    case 'unassigned':
      console.log('Issue unassigned');
      console.log(payload.issue.assignee); // always null? or list if more than one?
      project.updateIssueStatus(payload.issue.node_id);
      break;
    case 'labeled':
      console.log('Issue labeled');
      console.log(`${payload.issue.title}: ${payload.label.name}`);
      payload.label.name === 'OpenOasis' &&
        project.addIssueToProject(payload.issue);
      break;
    case 'unlabeled':
      console.log('Issue unlabeled');
      console.log(`${payload.issue.title}: ${payload.label.name}`);
      payload.label.name === 'OpenOasis' &&
        project.removeIssueFromProject(payload.issue);
      break;
    case 'closed':
      project.updateIssueStatus(payload.issue.node_id);
      break;
    case 'reopened':
      project.updateIssueStatus(payload.issue.node_id);
      break;
    default:
      console.log('Unassigned action');
      console.log(payload.action);
      console.log(payload);
  }
};

const handlePullRequestEvent = (payload) => {
  console.log(payload);
  // Pull request assigned, auto merge disabled, auto merge enabled, closed, converted to draft, demilestoned, dequeued, edited, enqueued, labeled, locked, milestoned, opened, ready for review, reopened, review request removed, review requested, synchronized, unassigned, unlabeled, or unlocked.
  switch (payload.action) {
    case 'opened':
      console.log('Pull request opened');
      break;
    case 'closed':
      console.log('Pull request opened');
      break;
    default:
      console.log('Unassigned action');
  }
};

export const handleGithubEvent = (name, payload) => {
  switch (name) {
    case 'issues':
      handleIssueEvent(payload);
      break;
    case 'pull_request':
      handlePullRequestEvent(payload);
      break;
    default:
      console.log('Unknown event received');
  }
};
