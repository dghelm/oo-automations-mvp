// Github Projects Imports
import { graphql } from '@octokit/graphql';

let gql;
let organization;
let organizationProjectNumber;
let projectId;

// TODO: Change from hardcoded to dynamic? Or at match to current project
const status = {
  id: 'PVTSSF_lADOCXQacM4AccWTzgSYUxk',
  'Open Bounty': 'f75ad846',
  'In Progress': '47fc9ee4',
  'In Review': 'd4a2e9a1',
  Done: '98236657',
};

async function init(authKey, githubOrg, projectNumber, verbose = false) {
  // Setup Github API auth
  gql = graphql.defaults({
    headers: {
      authorization: `token ${authKey}`,
    },
  });

  // Grab project ID from org and project number
  const project = await gql(`
	{
		organization(login: "${githubOrg}"){
			projectV2(number: ${projectNumber}){
			  id
			}
    }
  }
      `);

  console.log(
    'Setting Active Project ID: ',
    project.organization.projectV2?.id
  );

  organization = githubOrg;
  organizationProjectNumber = projectNumber;
  projectId = project.organization.projectV2?.id;

  // Test methods on startup
  let itemId = 'PVTI_lADOCXQacM4AccWTzgOFnPk';
  await updateItemStatus(itemId);

  // Grab fields for project
  if (verbose) {
    const fields = await gql(`
  query{
	node(id: "${project.organization.projectV2.id}") {
	  ... on ProjectV2 {
	    fields(first: 20) {
	      nodes {
		... on ProjectV2Field {
		  id
		  name
		}
		... on ProjectV2IterationField {
		  id
		  name
		  configuration {
		    iterations {
		      startDate
		      id
		    }
		  }
		}
		... on ProjectV2SingleSelectField {
		  id
		  name
		  options {
		    id
		    name
		  }
		}
	      }
	    }
	  }
	}
      }
      `);
    console.log('Fields: ');

    console.log(JSON.stringify(fields, null, 4));
  }
}

async function getProjectItemIdFromIssueId(issueId) {
  // Grab project issues from org and project number
  const project = await gql(`
	{
		organization(login: "${organization}"){
			projectV2(number: ${organizationProjectNumber}){
			  id
        items(first: 200) {
          nodes {
            ... on ProjectV2Item {
              id
              databaseId
              fullDatabaseId
              content {
                ... on Issue {
                  id
                  title
                }
              }
            }
          }
        }
			}
    }
  }
      `);

  let itemId = undefined;

  // Loop through all current project items and find the issue to remove, if it exists
  // Note: It may be able to query for the node_id of the issue directly, but I couldn't figure it out using gql
  for (const item of project.organization.projectV2.items.nodes) {
    if (item.content.id === issueId) {
      itemId = item.id;
    }
  }

  return itemId;
}

async function getProjectItemDetails(itemId) {
  // Might make more sense to grab needed fields in various methods, but for now it's still slim.
  const projectItem = await gql(`
  {
    node(id: "${itemId}") {
      id
      ... on ProjectV2Item {
        fieldValueByName(name: "Status"){
          ... on ProjectV2ItemFieldSingleSelectValue {
            name
          }
        }
        content {
          ... on Issue {
            assignees(first:10) {
              edges {
                node {
                  id
                }
              }
            }
            closed
            state
            stateReason
            trackedIssuesCount
            url
          }
        }
      }
    }
  }
      `);

  const projectPRs = await gql(`
  {
    node(id: "${itemId}") {
      id
      ... on ProjectV2Item {
        fieldValueByName(name: "Linked pull requests") {
          ... on ProjectV2ItemFieldPullRequestValue {
            pullRequests(first: 15) {
              nodes {
                number
                title
                assignees(first: 100) {
                  nodes {
                    name
                    login
                    id
                  }
                }
                closed
                closedAt
                isDraft
                merged
                mergedAt
                url
                state
                title
                author {
                  ... on User {
                    name
                    id
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  `);

  const projectItemDetails = {
    ...projectItem.node,
    pullRequests: projectPRs.node.fieldValueByName.pullRequests.nodes,
  };

  return projectItemDetails;
}

async function addIssueToProject(issue, verbose = true) {
  // Note: This will reset status to "Open Bounty"
  // see: https://docs.github.com/en/graphql/reference/objects#projectv2item
  const result = await gql(` 
	mutation {
		addProjectV2ItemById(input: {projectId: "${projectId}" contentId: "${issue.node_id}"}) {
			item {
				id
				content
			}
		}
	}
	`);

  console.log(
    'Added Issue as Item to Project: ',
    result.addProjectV2ItemById.item.id,
    issue.node_id
  );

  updateItemStatus(result.addProjectV2ItemById.item.id);

  return;
}

async function removeIssueFromProject(issue) {
  const itemId = await getProjectItemIdFromIssueId(issue.node_id);

  if (itemId) {
    // see: https://docs.github.com/en/graphql/reference/objects#projectv2item
    const result = await gql(` 
    mutation {
      deleteProjectV2Item(input: {projectId: "${projectId}" itemId: "${itemId}"}) {
        deletedItemId
      }
    }
    `);

    console.log(
      'Removed Issue as Item from Project: ',
      result.deleteProjectV2Item.deletedItemId
    );
  } else {
    console.log('Issue not found in project, skipping removal.');
  }

  return;
}

async function changeItemStatus(itemId, statusLabel) {
  console.log('Changing Issue Status to: ', statusLabel);

  await gql(` 
  mutation {
	updateProjectV2ItemFieldValue(
	  input: {
	    projectId: "${projectId}"
	    itemId: "${itemId}"
	    fieldId: "${status.id}"
	    value: { 
	      singleSelectOptionId: "${status[statusLabel]}"        
	    }
	  }
	) {
	  projectV2Item {
	    id
	  }
	}
      }
	`);
}

async function updateItemStatus(itemId) {
  // Here's the general logic of this method:
  // default should be Open Bounty
  // when assigned, change to In Progress
  // when unassigned to no assignees, change to Open Bounty
  // when PR created, change to In Review
  // when PR merged, change to Done

  // get issue details + status
  const item = await getProjectItemDetails(itemId);

  // if issue is already set to "Done" and this isn't being reopenned don't change it again. return
  if (
    item.fieldValueByName?.name === 'Done' &&
    item.content.stateReason !== 'REOPENED'
  ) {
    console.log('Project item already set to Done, skipping status update.');
    return;
  }

  // Currently, we don't label as "DONE" here if issue state is closed, set to Done.
  // Because of multiple calls to method, this may trigger before
  // a PR check happens below, and it's best to check that it was done by the assigned contributor.

  // if (
  //   item.content.state === 'CLOSED' &&
  //   item.content.stateReason === 'COMPLETED'
  // ) {
  //   changeItemStatus(itemId, 'Done');
  //   return;
  // }

  // if issue state is closed, but "not planned" set to Open Oasis even though it's weird.
  if (
    item.content.state === 'CLOSED' &&
    item.content.stateReason === 'NOT_PLANNED'
  ) {
    changeItemStatus(itemId, 'Open Bounty');
    return;
  }

  // check assignees -- if exists, check PRs for In Progress vs In Review
  if (item.content.assignees.edges.length > 0) {
    // get list of assignees to compare to PR authors
    const assignees = item.content.assignees.edges.map((a) => a.node.id);

    // only use authors of PRs that aren't in draft state and are open or merged
    // drafts and close PRs can be considered as not in review or done
    const prAuthors = item.pullRequests
      .filter(
        (pr) => !pr.isDraft && (pr.state === 'OPEN' || pr.state === 'MERGED')
      )
      .map((pr) => pr.author.id);

    // Convert one of the arrays to a Set to take advantage of O(1) lookup times
    const setPrAuthors = new Set(prAuthors);

    // Filter assignees to only include users that exist in setB
    const commonUsers = assignees.filter((item) => setPrAuthors.has(item));

    if (commonUsers.length > 0) {
      // Check if any ID from commonUsers is an author of a merged pull request
      const isAnyCommonUserAuthorOfMergedPR = commonUsers.some((userId) =>
        item.pullRequests.some(
          (pr) => pr.author.id === userId && pr.merged === true
        )
      );

      // Are any of these PRs merged? If so, set as Done.
      // If not, set to In Reivew
      isAnyCommonUserAuthorOfMergedPR
        ? changeItemStatus(itemId, 'Done')
        : changeItemStatus(itemId, 'In Review');
    } else {
      // otherwise, just say In Progress
      changeItemStatus(itemId, 'In Progress');
    }
  } else {
    // no assignees? leave as Open Bounty
    changeItemStatus(itemId, 'Open Bounty');
  }
}

async function updateIssueStatus(issueId) {
  const itemId = await getProjectItemIdFromIssueId(issueId);

  if (itemId) {
    updateItemStatus(itemId);
  } else {
    console.log('Issue not found in project, skipping status update.');
  }

  return;
}

const project = {
  init: init,
  addIssueToProject: addIssueToProject,
  removeIssueFromProject: removeIssueFromProject,
  updateIssueStatus: updateIssueStatus,
};

export default project;

/** Fields for the-raul testing project. needs to change these for prod. TODO
 * 
 * Fields:
{
    "node": {
        "fields": {
            "nodes": [
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxc",
                    "name": "Title"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxg",
                    "name": "Assignees"
                },
                {
                    "id": "PVTSSF_lADOCXQacM4AccWTzgSYUxk",
                    "name": "Status",
                    "options": [
                        {
                            "id": "f75ad846",
                            "name": "Open Bounty"
                        },
                        {
                            "id": "47fc9ee4",
                            "name": "In progress"
                        },
                        {
                            "id": "d4a2e9a1",
                            "name": "In Review"
                        },
                        {
                            "id": "98236657",
                            "name": "Done"
                        }
                    ]
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxo",
                    "name": "Labels"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxs",
                    "name": "Linked pull requests"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUx0",
                    "name": "Reviewers"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUx4",
                    "name": "Repository"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUx8",
                    "name": "Milestone"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUyQ",
                    "name": "USDC Payout"
                }
            ]
        }
    }
}
 * 
 * 
 * 
 * 
 */

// async function addIssueToProject(issue, verbose = true) {
//   if (verbose) {
//     console.log('Adding Issue to Project: ');
//     console.log(JSON.stringify(issue, null, 4));
//     // Interesting issue fields:
//     //     state
//     //     assignee
//     //     assignees
//     //     state_reason
//   }

//   // see: https://docs.github.com/en/graphql/reference/objects#projectv2item
//   const result = await gql(`
// 	mutation {
// 		addProjectV2ItemById(input: {projectId: "${projectId}" contentId: "${issue.node_id}"}) {
// 			item {
// 				id
// 				content
// 			}
// 		}
// 	}
// 	`);

//   // fieldValues
//   // fieldValueByName("string")

//   console.log(
//     'Added Issue as Item to Project: ',
//     result.addProjectV2ItemById.item.id
//   );

//   //

//   // TODO: if no status, change to Open Bounty, might need to
//   changeIssueStatus(result.addProjectV2ItemById.item.id, 'Open Bounty');

//   return;
// }
